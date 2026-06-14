import { ulid } from "ulid";
import {
  AppearanceSpecSchema,
  parseCard,
  parseSprite,
  SCHEMA_VERSION,
  defaultRuntimeConfig,
  makeSkeletonBundle,
  makeSkeletonSprite,
  summarizeAppearance,
  type AppearanceSpec,
  type CharacterBundle,
  type CharacterCard,
  type DistillationJob,
  type DistillationJobConfig,
  type LayeredRigHints,
  type QualityReport,
  type ResearchAgentId,
  type ResearchDoc,
  type SpriteProgram
} from "@nuwa-pet/character-protocol";
import {
  buildAppearanceCritiquePrompt,
  buildAppearanceImageSearchPrompt,
  buildAppearanceResearchPrompt,
  buildAppearanceSpecPrompt,
  buildAppearanceVisionExtractionPrompt,
  buildAppearanceVisionVerificationPrompt,
  buildCharacterCardPrompt,
  buildFrameworkSynthesisPrompt,
  buildLayeredRigVisionPrompt
} from "@nuwa-pet/nuwa-prompts";
import type { LLMAdapter, ChatContentPart } from "../adapters/llm-adapter.js";
import { runResearchAgents } from "./research-pipeline.js";
import { runQualityCheck } from "./quality-check.js";
import { buildLayeredPetFromAppearance } from "./layered-pet-builder.js";

/** 一张供 vision pipeline 使用的参考图。 */
export interface ReferenceImageInput {
  url: string;
  source: "user-upload" | "web";
  role?: "primary" | "reference";
  notes?: string;
}

export interface OrchestrateInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  track: "utility" | "companion";
  userHint?: string;
  userMaterial?: string;
  /** v0.2 快速模式也支持参考图（前提是 provider 支持 vision）。 */
  referenceImages?: ReferenceImageInput[];
}

export interface OrchestrateResult {
  ok: true;
  bundle: CharacterBundle;
  isSkeleton: boolean;
  warnings: string[];
}

export interface RegenerateSpriteResult {
  ok: boolean;
  sprite?: SpriteProgram;
  warnings: string[];
  error?: string;
}

export interface RegenerateAppearanceResult {
  ok: boolean;
  appearance?: AppearanceSpec;
  sprite?: SpriteProgram;
  warnings: string[];
  error?: string;
}

/** 深度蒸馏 generator 产出的进度事件。 */
export type DeepProgressEvent =
  | { kind: "started"; jobId: string }
  | { kind: "phase"; jobId: string; phase: DistillationJob["status"]; progress: number; message: string }
  | { kind: "agent_start"; jobId: string; agentId: ResearchAgentId; agentName: string }
  | { kind: "agent_done"; jobId: string; doc: ResearchDoc }
  | { kind: "research_complete"; jobId: string; summary: ResearchSummaryPayload }
  | { kind: "synthesis_summary"; jobId: string; summary: SynthesisSummaryPayload }
  | { kind: "appearance_ready"; jobId: string; appearance: AppearanceSpec }
  | { kind: "quality_report"; jobId: string; report: QualityReport }
  | { kind: "warning"; jobId: string; message: string }
  | { kind: "done"; jobId: string; bundle: CharacterBundle; isSkeleton: boolean; warnings: string[] }
  | { kind: "failed"; jobId: string; reason: string; warnings: string[] }
  | { kind: "cancelled"; jobId: string };

export interface ResearchSummaryPayload {
  docs: Array<Pick<ResearchDoc, "agentId" | "agentName" | "status" | "confidence" | "webSearchUsed" | "durationMs" | "sources" | "errorMessage"> & { excerpt: string }>;
  okCount: number;
  failedCount: number;
  totalDurationMs: number;
}

export interface SynthesisSummaryPayload {
  mentalModelNames: string[];
  heuristicsCount: number;
  expressionSignatures: string[];
  expressionForbidden: string[];
  tensions: string[];
  honestyNotes: string[];
}

/**
 * 深度蒸馏入参：来自 IPC，已经被 DistillationJobConfigSchema 校验。
 * 与快速版 OrchestrateInput 互补。
 */
export interface DeepOrchestrateInput {
  jobId: string;
  config: DistillationJobConfig;
  /** 上层用于在 Checkpoint 等待用户确认；resolve 后继续；reject 则取消。 */
  awaitApproval: (phase: "research" | "synthesis") => Promise<void>;
  /** 是否启用风格测试（额外 LLM 调用），默认 true。 */
  runVoiceTest?: boolean;
  signal?: AbortSignal;
}

export class NuwaOrchestrator {
  constructor(private llm: LLMAdapter) {}

  /**
   * 三步串行：
   *   Step 1: 人格卡（CharacterCard 的 card 部分）
   *   Step 2: 外貌调研（AppearanceSpec）
   *   Step 3: 像素桌宠（SpriteProgram，基于 appearance 转译）
   * 任一步失败：对应字段回退到骨架；全失败给完整骨架。
   */
  async createCharacter(input: OrchestrateInput): Promise<OrchestrateResult> {
    const warnings: string[] = [];
    const id = ulid();
    const now = Date.now();

    // ===== Step 1: 人格卡 =====
    const cardResult = await this.runCardStep(input, warnings);

    // ===== Step 2: 外貌调研 =====
    // 快速模式：如果用户上传了参考图 + provider 支持 vision，走 vision-first 路径；
    // 否则退到纯文本 prompt（旧 runAppearanceStep）。
    const appearanceResult = await this.runAppearanceForQuick(input, warnings);

    // ===== Step 3: CSS 分层桌宠（依赖 appearance + 参考图）=====
    const spriteResult = appearanceResult
      ? await this.runVisualStep(
          input.characterName,
          input.sourceType,
          appearanceResult,
          input.referenceImages ?? [],
          warnings
        )
      : null;

    // ===== 组装最终 bundle =====
    const skeleton = makeSkeletonBundle({
      id,
      name: input.characterName,
      sourceName: input.sourceType !== "original" ? input.characterName : undefined,
      sourceType: input.sourceType,
      track: input.track,
      now
    });

    const card: CharacterCard = cardResult ?? skeleton.card;
    // 补齐 id / 时间戳 / track / sourceType / disclaimer 兜底
    card.id = id;
    card.schemaVersion = SCHEMA_VERSION;
    card.createdAt = now;
    card.updatedAt = now;
    card.meta.track = input.track;
    card.meta.sourceType = input.sourceType;
    if (input.sourceType !== "original" && !card.meta.sourceName) {
      card.meta.sourceName = input.characterName;
    }

    // 外貌信息回写
    if (appearanceResult) {
      card.meta.appearance = appearanceResult;
      card.meta.avatarHint = summarizeAppearance(appearanceResult);
    }

    const sprite: SpriteProgram = spriteResult ?? skeleton.sprite;
    sprite.schemaVersion = SCHEMA_VERSION;

    const isSkeleton =
      cardResult == null && appearanceResult == null && spriteResult == null;

    return {
      ok: true,
      isSkeleton,
      warnings,
      bundle: {
        card,
        sprite,
        runtime: defaultRuntimeConfig()
      }
    };
  }

  /**
   * 只跑 Step 3：基于现有 card.meta.appearance 重新生成 sprite。
   * 用于"重新生成形象"按钮：不动人格、不动外貌调研，只换形象部件 / 排布。
   */
  async regenerateSprite(input: {
    card: CharacterCard;
  }): Promise<RegenerateSpriteResult> {
    const warnings: string[] = [];
    const appearance = input.card.meta.appearance;
    if (!appearance) {
      // 兼容旧卡：没有 appearance → 给一个 track 推导的骨架 sprite
      warnings.push("角色卡缺少 meta.appearance，无法精修，回退到骨架形象");
      return {
        ok: true,
        sprite: makeSkeletonSprite(input.card.meta.track),
        warnings
      };
    }
    const refs = (appearance.referenceImages ?? []).map((r) => ({
      url: r.url,
      source: r.source,
      role: r.role,
      notes: r.notes
    }));
    const sprite = await this.runVisualStep(
      input.card.meta.name,
      input.card.meta.sourceType,
      appearance,
      refs,
      warnings
    );
    if (!sprite) {
      return {
        ok: false,
        error: warnings[warnings.length - 1] ?? "形象生成失败",
        warnings,
        sprite: makeSkeletonSprite(input.card.meta.track)
      };
    }
    return { ok: true, sprite, warnings };
  }

  /**
   * 深度蒸馏 async generator：对齐女娲完整流程。
   *
   * 流程：
   *   Phase 1: 6 Agent 并行调研 → yield agent_start / agent_done / research_complete
   *   Checkpoint 1: await 用户确认（外部 resolve approve）
   *   Phase 2: 框架提炼 → yield synthesis_summary
   *   Checkpoint 2: await 用户确认
   *   Phase 3a/b/c: 装配 CharacterCard + 深度外貌（3 步） + Sprite
   *   Phase 4: 质量自检 → yield quality_report
   *   落盘 → yield done
   */
  async *createCharacterDeep(input: DeepOrchestrateInput): AsyncGenerator<DeepProgressEvent> {
    const { jobId, config } = input;
    const warnings: string[] = [];
    const aborted = (): boolean => input.signal?.aborted === true;
    const yieldWarn = (msg: string) => {
      warnings.push(msg);
      return { kind: "warning" as const, jobId, message: msg };
    };

    yield { kind: "started", jobId };

    // ===== Phase 1: 6 Agent 并行调研 =====
    yield phaseEvent(jobId, "researching", 5, "启动 6 路并行调研…");
    if (config.enableWebSearch) {
      const webReadyError = await this.verifyWebSearchReady(config);
      if (webReadyError) {
        yield yieldWarn(webReadyError);
        yield { kind: "failed", jobId, reason: webReadyError, warnings };
        return;
      }
    }
    const agentEventBuffer: DeepProgressEvent[] = [];
    const research = await runResearchAgents(this.llm, {
      characterName: config.characterName,
      sourceType: config.sourceType,
      track: config.track,
      userMaterial: config.userMaterial,
      webSearchEnabled: config.enableWebSearch,
      concurrency: config.concurrency,
      timeoutMs: config.agentTimeoutMs,
      researchModel: config.researchModel,
      onAgentStart: (slug, agentName) => {
        const id = AGENT_SLUG_TO_ID[slug];
        if (id == null) return;
        agentEventBuffer.push({ kind: "agent_start", jobId, agentId: id, agentName });
      },
      onAgentDone: (doc) => {
        agentEventBuffer.push({ kind: "agent_done", jobId, doc });
      }
    });
    // 把缓存的事件按顺序 yield 出来（runResearchAgents 是 await 整个完成的，事件回调期间没法 yield，
    // 所以这里一次性 flush；UI 收到时也会按时间序渲染）
    for (const evt of agentEventBuffer) yield evt;

    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

    const researchSummary: ResearchSummaryPayload = {
      docs: research.docs.map((d) => ({
        agentId: d.agentId,
        agentName: d.agentName,
        status: d.status,
        confidence: d.confidence,
        webSearchUsed: d.webSearchUsed,
        durationMs: d.durationMs,
        sources: d.sources,
        errorMessage: d.errorMessage,
        excerpt: d.markdown.slice(0, 400)
      })),
      okCount: research.okCount,
      failedCount: research.failedCount,
      totalDurationMs: research.totalDurationMs
    };
    yield { kind: "research_complete", jobId, summary: researchSummary };
    yield phaseEvent(
      jobId,
      "awaiting_research_ok",
      30,
      `调研完成（成功 ${research.okCount}/6，失败 ${research.failedCount}），等待你确认`
    );

    if (research.failedCount >= 3) {
      yield yieldWarn(`6 个 agent 中有 ${research.failedCount} 个失败/超时，仍可继续，但建议关注调研质量`);
    }

    // 关键：检查"开了联网但实际没真触发"——这意味着模型只是用训练知识硬编，
    // 用户应该被告知"这次结果可能是模型瞎编的"。
    if (config.enableWebSearch) {
      const realWebUsed = research.docs.filter((d) => d.webSearchUsed).length;
      if (realWebUsed === 0 && research.okCount > 0) {
        yield yieldWarn(
          `调研阶段开了联网，但 0/${research.okCount} 个 agent 实际触发 web_search —— ` +
            `这通常意味着中转站没把 web_search_options 透传给 OpenAI（OhMyGPT 等代理可能如此），` +
            `结果可能基于模型训练知识"瞎编"。建议换 baseUrl 到 https://api.openai.com 直连，` +
            `或换支持 server-side web_search 的 Anthropic 模型。`
        );
      } else if (realWebUsed > 0 && realWebUsed < Math.ceil(research.okCount / 2)) {
        yield yieldWarn(
          `只有 ${realWebUsed}/${research.okCount} 个 agent 真触发了联网，其余靠训练知识。` +
            `建议在角色仓库中确认信息可信度。`
        );
      }
    }

    // 等待用户在 UI 上点「确认」
    try {
      await input.awaitApproval("research");
    } catch (e) {
      yield { kind: "cancelled", jobId };
      return;
    }
    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

    // ===== Phase 2: 框架提炼 =====
    yield phaseEvent(jobId, "synthesizing", 40, "正在用调研结果提炼心智模型与表达 DNA…");
    const synthCard = await this.runSynthesisStep(config, research.docs, warnings);
    if (!synthCard) {
      yield yieldWarn("[phase2·synthesis] 框架提炼失败，将回退到骨架角色");
    }

    if (synthCard) {
      const summary: SynthesisSummaryPayload = {
        mentalModelNames: synthCard.mentalModels.map((m) => m.name),
        heuristicsCount: synthCard.heuristics.length,
        expressionSignatures: synthCard.expressionDNA.vocabulary.signature ?? [],
        expressionForbidden: synthCard.expressionDNA.vocabulary.forbidden ?? [],
        tensions: synthCard.values.tensions ?? [],
        honestyNotes: synthCard.honestyBoundary.notes ?? []
      };
      yield { kind: "synthesis_summary", jobId, summary };
    }
    yield phaseEvent(jobId, "awaiting_synth_ok", 55, "提炼完成，等待你确认");

    try {
      await input.awaitApproval("synthesis");
    } catch (e) {
      yield { kind: "cancelled", jobId };
      return;
    }
    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

    // ===== Phase 3a: 装配 CharacterCard =====
    yield phaseEvent(jobId, "building_card", 60, "装配人格卡…");
    const cardId = ulid();
    const now = Date.now();
    const skeleton = makeSkeletonBundle({
      id: cardId,
      name: config.characterName,
      sourceName: config.sourceType !== "original" ? config.characterName : undefined,
      sourceType: config.sourceType,
      track: config.track,
      now
    });
    const card: CharacterCard = synthCard ?? skeleton.card;
    card.id = cardId;
    card.schemaVersion = SCHEMA_VERSION;
    card.createdAt = now;
    card.updatedAt = now;
    card.meta.track = config.track;
    card.meta.sourceType = config.sourceType;
    if (config.sourceType !== "original" && !card.meta.sourceName) {
      card.meta.sourceName = config.characterName;
    }

    // ===== Phase 3b: 深度外貌（vision-first 流程） =====
    yield phaseEvent(
      jobId,
      "researching_appearance",
      70,
      "深度外貌调研：vision 读图 → 结构化 → 视觉自检…"
    );
    // 兼容旧字段：userImageRef 也算一张参考图
    const refs: ReferenceImageInput[] = [...(config.referenceImages ?? [])];
    if (
      config.userImageRef &&
      !refs.some((r) => r.url === config.userImageRef)
    ) {
      refs.push({
        url: config.userImageRef,
        source: "user-upload",
        role: "primary",
        notes: "userImageRef (legacy)"
      });
    }
    const appearance = await this.runAppearanceDeep(
      {
        characterName: config.characterName,
        sourceName: card.meta.sourceName,
        sourceType: config.sourceType,
        track: config.track,
        userHint: config.userHint,
        userMaterial: config.userMaterial,
        referenceImages: refs
      },
      config.enableWebSearch,
      warnings,
      config.researchModel
    );
    if (appearance) {
      card.meta.appearance = appearance;
      card.meta.avatarHint = summarizeAppearance(appearance);
      yield { kind: "appearance_ready", jobId, appearance };
    }

    // ===== Phase 3c: CSS 分层桌宠 =====
    yield phaseEvent(jobId, "building_sprite", 80, "把外貌转译为 CSS 分层桌宠…");
    const sprite =
      appearance != null
        ? await this.runVisualStep(
            config.characterName,
            config.sourceType,
            appearance,
            refs,
            warnings
          )
        : null;
    const finalSprite: SpriteProgram = sprite ?? skeleton.sprite;
    finalSprite.schemaVersion = SCHEMA_VERSION;

    // ===== Phase 4: 质量自检 =====
    yield phaseEvent(jobId, "quality_check", 90, "运行质量自检…");
    let qualityReport: QualityReport | undefined;
    try {
      qualityReport = await runQualityCheck(this.llm, {
        card,
        researchDocs: research.docs,
        runVoiceTest: input.runVoiceTest ?? true
      });
      yield { kind: "quality_report", jobId, report: qualityReport };
    } catch (e) {
      yield yieldWarn(
        `[phase4·quality] 自检失败：${e instanceof Error ? e.message : String(e)}`
      );
    }

    const isSkeleton =
      synthCard == null && appearance == null && sprite == null;

    const bundle: CharacterBundle = {
      card,
      sprite: finalSprite,
      runtime: defaultRuntimeConfig(),
      researchDocs: research.docs,
      qualityReport
    };

    yield { kind: "done", jobId, bundle, isSkeleton, warnings };
  }

  // ===== 内部步骤 =====

  private async runCardStep(
    input: OrchestrateInput,
    warnings: string[]
  ): Promise<CharacterCard | null> {
    const { system, user } = buildCharacterCardPrompt({
      characterName: input.characterName,
      sourceType: input.sourceType,
      track: input.track,
      userMaterial: input.userMaterial
    });
    const r = await this.llm.chatOnce({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      temperature: 0.4,
      maxTokens: 3500,
      stream: false
    });
    if (r.kind === "error") {
      warnings.push(`[step1·card] LLM 调用失败：${r.message}`);
      return null;
    }
    const json = extractJSON(r.text) as Record<string, unknown> | null;
    if (!json) {
      warnings.push("[step1·card] LLM 未返回合法 JSON");
      return null;
    }
    // 给 card schema 喂的对象需要 id / schemaVersion / 时间戳，
    // 这里先填占位，后面 createCharacter 末尾会重置真实值。
    const seeded: Record<string, unknown> = {
      ...json,
      id: "temp",
      schemaVersion: SCHEMA_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const parsed = parseCard(seeded);
    if (parsed.ok && parsed.data) return parsed.data;
    warnings.push(
      `[step1·card] 校验失败：${(parsed.errors ?? []).map((e) => e.path).slice(0, 6).join(", ")}`
    );
    return null;
  }

  /**
   * 快速模式外貌路径：
   *   - 有用户参考图 + provider 支持 vision → 走 vision Step A+B
   *   - 否则 → 旧的纯文本一次性 prompt
   */
  private async runAppearanceForQuick(
    input: OrchestrateInput,
    warnings: string[]
  ): Promise<AppearanceSpec | null> {
    const refs = input.referenceImages ?? [];
    const vis = this.llm.detectVisionCapability();
    if (refs.length > 0 && vis.vision) {
      // 喂图，让 vision 模型生成 spec
      const spec = await this.runAppearanceVisionFromImages(
        {
          characterName: input.characterName,
          sourceName:
            input.sourceType !== "original" ? input.characterName : undefined,
          sourceType: input.sourceType,
          track: input.track,
          userHint: input.userHint,
          userMaterial: input.userMaterial,
          referenceImages: refs
        },
        warnings,
        { runVerification: false } // 快速模式跳过 verify，省一次调用
      );
      if (spec) return spec;
      // vision 失败 → 退到文本
    }
    if (refs.length > 0 && !vis.vision) {
      warnings.push(
        `[step2·appearance] 当前 LLM 不支持视觉输入（${vis.reason}），上传的参考图被忽略，回退到纯文本路径，结果可能偏离原作。`
      );
    }
    return this.runAppearanceTextOnly(input, warnings);
  }

  /** 旧的纯文本一次性 prompt（fallback）。 */
  private async runAppearanceTextOnly(
    input: {
      characterName: string;
      sourceType: "public-figure" | "fictional" | "original";
      track: "utility" | "companion";
      userHint?: string;
      userMaterial?: string;
    },
    warnings: string[]
  ): Promise<AppearanceSpec | null> {
    const { system, user } = buildAppearanceResearchPrompt({
      characterName: input.characterName,
      sourceType: input.sourceType,
      track: input.track,
      userHint: input.userHint,
      userMaterial: input.userMaterial
    });
    const r = await this.llm.chatOnce({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      temperature: 0.3,
      maxTokens: 2500,
      stream: false
    });
    if (r.kind === "error") {
      warnings.push(`[step2·appearance] LLM 调用失败：${r.message}`);
      return null;
    }
    const json = extractJSON(r.text);
    if (!json) {
      warnings.push("[step2·appearance] LLM 未返回合法 JSON");
      return null;
    }
    const parsed = AppearanceSpecSchema.safeParse(json);
    if (parsed.success) return this.stampReferenceImages(parsed.data, []);
    warnings.push(
      `[step2·appearance] 校验失败：${parsed.error.errors.slice(0, 6).map((e) => e.path.join(".")).join(", ")}`
    );
    return null;
  }

  /**
   * Phase 2: 框架提炼。吃 6 份调研 Markdown，吐 CharacterCard。
   */
  private async runSynthesisStep(
    config: DistillationJobConfig,
    docs: ResearchDoc[],
    warnings: string[]
  ): Promise<CharacterCard | null> {
    const segments = docs.map((d) => ({
      agentId: d.agentId,
      agentName: d.agentName,
      markdown: d.status === "ok" ? d.markdown : `> Agent ${d.agentId} 失败：${d.errorMessage ?? "未知"}`,
      confidence: d.confidence
    }));
    const { system, user } = buildFrameworkSynthesisPrompt({
      characterName: config.characterName,
      sourceType: config.sourceType,
      track: config.track,
      researchSegments: segments,
      userMaterial: config.userMaterial
    });
    const r = await this.llm.chatOnce({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      temperature: 0.3,
      maxTokens: 5000,
      stream: false
    });
    if (r.kind === "error") {
      warnings.push(`[phase2·synthesis] LLM 调用失败：${r.message}`);
      return null;
    }
    const json = extractJSON(r.text) as Record<string, unknown> | null;
    if (!json) {
      warnings.push("[phase2·synthesis] LLM 未返回合法 JSON");
      return null;
    }
    const seeded: Record<string, unknown> = {
      ...json,
      id: "temp",
      schemaVersion: SCHEMA_VERSION,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const parsed = parseCard(seeded);
    if (parsed.ok && parsed.data) return parsed.data;
    warnings.push(
      `[phase2·synthesis] 校验失败：${(parsed.errors ?? []).map((e) => e.path).slice(0, 6).join(", ")}`
    );
    return null;
  }

  /**
   * 深度外貌 vision-first 流程：
   *   Step 0: 收集参考图（用户上传优先 → 否则联网搜图 URL）
   *   Step A: vision 读图 → Markdown 视觉描述（multimodal）
   *   Step B: text → AppearanceSpec JSON（基于 Step A 描述 + userHint）
   *   Step C: vision 自检（multimodal）→ 输出 mismatches & suggestions；把 suggestions 合并到 spec
   * 无 vision / 无图 → 全部降级到旧的纯文本三步（imageSearch → spec → critique）。
   */
  private async runAppearanceDeep(
    input: {
      characterName: string;
      sourceName?: string;
      sourceType: "public-figure" | "fictional" | "original";
      track: "utility" | "companion";
      userHint?: string;
      userMaterial?: string;
      referenceImages: ReferenceImageInput[];
    },
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string
  ): Promise<AppearanceSpec | null> {
    const vis = this.llm.detectVisionCapability();

    // Step 0: 收集参考图
    let refs = input.referenceImages.slice(0, 4);
    if (refs.length === 0 && webSearchEnabled && vis.vision) {
      // 没图但允许联网且支持 vision → 搜官方人设图 URL，喂给 vision 读
      const found = await this.searchOfficialImageUrls(
        input,
        researchModel,
        warnings
      );
      refs = found.slice(0, 4);
    }

    if (vis.vision && refs.length > 0) {
      // 真正走 vision 路径
      const spec = await this.runAppearanceVisionFromImages(
        { ...input, referenceImages: refs },
        warnings,
        { runVerification: true }
      );
      if (spec) return spec;
      warnings.push(
        "[phase3b·vision] vision 路径未能产出合法 spec，降级到纯文本三步法"
      );
    } else if (!vis.vision) {
      warnings.push(
        `[phase3b·vision] 当前 LLM 不支持视觉输入（${vis.reason}），降级到纯文本三步法；结果可能偏离原作。`
      );
    } else {
      warnings.push(
        "[phase3b·vision] 无参考图且未联网搜图成功，降级到纯文本三步法"
      );
    }

    return this.runAppearanceTextDeepFallback(
      {
        characterName: input.characterName,
        sourceName: input.sourceName,
        sourceType: input.sourceType,
        track: input.track,
        userHint: input.userHint,
        userMaterial: input.userMaterial,
        userImageRef: refs[0]?.url
      },
      webSearchEnabled,
      warnings,
      researchModel
    );
  }

  /**
   * 用 web_search 找到 1-3 张「角色名 + 作品名 + official art / portrait」的图片 URL。
   * 走 chatWithTools；模型在回答里输出 URL 列表，我们解析出来喂给 vision Step A。
   */
  private async searchOfficialImageUrls(
    input: {
      characterName: string;
      sourceName?: string;
      sourceType: "public-figure" | "fictional" | "original";
    },
    researchModel: string | undefined,
    warnings: string[]
  ): Promise<ReferenceImageInput[]> {
    const sys = [
      "你是「角色形象搜图员」。用 web_search 工具找出该角色最常见的官方人设图 / 官方照片 URL。",
      "要求：",
      "1. 至少搜 2 次，覆盖中英文关键词。",
      "2. 优先 wikipedia / fandom / 官方网站 / 官方推特 / 工作室官网。",
      "3. 返回严格 JSON，仅 JSON：{ \"images\": [\"https://...\", \"https://...\"] }",
      "4. URL 必须是直接的图片地址（.jpg/.png/.webp）。",
      "5. 最多 3 个；若一个都没找到，返回 { \"images\": [] }。"
    ].join("\n");
    const user = `角色：「${input.characterName}」${input.sourceName ? `（${input.sourceName}）` : ""}\n类型：${input.sourceType}\n搜图，输出 JSON。`;

    const r = await this.llm.chatWithTools({
      systemPrompt: sys,
      messages: [{ role: "user", content: user }],
      temperature: 0.2,
      maxTokens: 1200,
      stream: false,
      enableWebSearch: true,
      maxToolCalls: 4,
      modelOverride: researchModel,
      searchContextSize: "low"
    });

    if (r.kind === "error") {
      warnings.push(`[phase3b·searchImg] 搜图失败：${r.message}`);
      return [];
    }

    const obj = extractJSON(r.text) as { images?: unknown } | null;
    const imgs = Array.isArray(obj?.images) ? (obj!.images as unknown[]) : [];
    const out: ReferenceImageInput[] = [];
    for (const u of imgs) {
      if (typeof u !== "string") continue;
      if (!/^https?:\/\//.test(u)) continue;
      out.push({
        url: u,
        source: "web",
        role: out.length === 0 ? "primary" : "reference",
        notes: "auto-searched"
      });
      if (out.length >= 3) break;
    }
    // 如果搜的引用本身也带图片 URL，也补进来
    for (const u of r.citations) {
      if (out.length >= 3) break;
      if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u)) continue;
      if (!out.some((x) => x.url === u)) {
        out.push({ url: u, source: "web", role: "reference", notes: "citation" });
      }
    }
    return out;
  }

  /**
   * 用 vision 模型直接读图，生成 AppearanceSpec。
   * Step A: vision-extract Markdown 视觉描述
   * Step B: 文本 LLM 把描述结构化为 spec JSON
   * Step C (optional): vision-verify 给出 mismatches，把 suggestions 合并回 spec
   */
  private async runAppearanceVisionFromImages(
    input: {
      characterName: string;
      sourceName?: string;
      sourceType: "public-figure" | "fictional" | "original";
      track: "utility" | "companion";
      userHint?: string;
      userMaterial?: string;
      referenceImages: ReferenceImageInput[];
    },
    warnings: string[],
    opts: { runVerification: boolean }
  ): Promise<AppearanceSpec | null> {
    const refs = input.referenceImages;
    if (refs.length === 0) return null;

    // Step A: vision-extract Markdown
    const a = buildAppearanceVisionExtractionPrompt({
      characterName: input.characterName,
      sourceName: input.sourceName,
      sourceType: input.sourceType,
      userHint: input.userHint,
      referenceImageCount: refs.length
    });
    const aContent: ChatContentPart[] = [{ type: "text", text: a.user }];
    for (const ref of refs) {
      aContent.push({ type: "image", url: ref.url, detail: "high" });
    }
    const aR = await this.llm.chatOnce({
      systemPrompt: a.system,
      messages: [{ role: "user", content: aContent }],
      temperature: 0.2,
      maxTokens: 1800,
      stream: false
    });
    if (aR.kind === "error") {
      warnings.push(`[phase3b·vision·A] 读图失败：${aR.message}`);
      return null;
    }
    const description = aR.text.trim();
    if (!description || /无法识别/.test(description)) {
      warnings.push("[phase3b·vision·A] 模型说看不懂图，退到文本路径");
      return null;
    }

    // Step B: text → spec JSON
    const b = buildAppearanceSpecPrompt({
      characterName: input.characterName,
      sourceName: input.sourceName,
      sourceType: input.sourceType,
      track: input.track,
      userHint: input.userHint,
      visualDescription: description
    });
    const bR = await this.llm.chatOnce({
      systemPrompt: b.system,
      messages: [{ role: "user", content: b.user }],
      temperature: 0.3,
      maxTokens: 2800,
      stream: false
    });
    if (bR.kind === "error") {
      warnings.push(`[phase3b·vision·B] spec 生成失败：${bR.message}`);
      return null;
    }
    let specObj = extractJSON(bR.text) as Record<string, unknown> | null;
    if (!specObj) {
      warnings.push("[phase3b·vision·B] spec 未返回合法 JSON");
      return null;
    }

    // Step C: vision-verify
    if (opts.runVerification) {
      const c = buildAppearanceVisionVerificationPrompt({
        characterName: input.characterName,
        specJson: JSON.stringify(specObj),
        referenceImageCount: refs.length
      });
      const cContent: ChatContentPart[] = [{ type: "text", text: c.user }];
      for (const ref of refs) {
        cContent.push({ type: "image", url: ref.url, detail: "high" });
      }
      const cR = await this.llm.chatOnce({
        systemPrompt: c.system,
        messages: [{ role: "user", content: cContent }],
        temperature: 0.1,
        maxTokens: 1200,
        stream: false
      });
      if (cR.kind === "done") {
        const critique = extractJSON(cR.text) as
          | {
              pass?: boolean;
              mismatches?: unknown;
              suggestions?: Record<string, unknown>;
            }
          | null;
        if (critique && critique.pass === false && critique.suggestions) {
          specObj = mergeSpecPatches(specObj, critique.suggestions);
          const ms = Array.isArray(critique.mismatches) ? critique.mismatches : [];
          if (ms.length > 0) {
            warnings.push(
              "[phase3b·vision·C] 已修正：" +
                ms.slice(0, 4).map((x) => String(x)).join(" | ")
            );
          }
        }
      } else {
        warnings.push(`[phase3b·vision·C] 视觉自检失败：${cR.message}，沿用 Step B`);
      }
    }

    const parsed = AppearanceSpecSchema.safeParse(specObj);
    if (parsed.success) return this.stampReferenceImages(parsed.data, refs);
    warnings.push(
      `[phase3b·vision] spec 校验失败：${parsed.error.errors
        .slice(0, 6)
        .map((e) => e.path.join("."))
        .join(", ")}`
    );
    return null;
  }

  /**
   * 旧的「联网搜图描述 + 结构化 + 自我批评」纯文本流，作为 vision 不可用时的降级路径。
   */
  private async runAppearanceTextDeepFallback(
    input: {
      characterName: string;
      sourceName?: string;
      sourceType: "public-figure" | "fictional" | "original";
      track: "utility" | "companion";
      userHint?: string;
      userMaterial?: string;
      userImageRef?: string;
    },
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string
  ): Promise<AppearanceSpec | null> {
    let description = "";
    if (webSearchEnabled) {
      const a = buildAppearanceImageSearchPrompt(input);
      const r = await this.llm.chatWithTools({
        systemPrompt: a.system,
        messages: [{ role: "user", content: a.user }],
        temperature: 0.3,
        maxTokens: 2500,
        stream: false,
        enableWebSearch: true,
        maxToolCalls: 6,
        modelOverride: researchModel,
        searchContextSize: "medium"
      });
      if (r.kind === "error") {
        warnings.push(`[phase3b·imageSearch] 失败：${r.message}`);
      } else {
        description = r.text.trim();
      }
    }
    if (!description) {
      return this.runAppearanceTextOnly(
        {
          characterName: input.characterName,
          sourceType: input.sourceType,
          track: input.track,
          userHint: input.userHint,
          userMaterial: input.userMaterial
        },
        warnings
      );
    }

    const b = buildAppearanceSpecPrompt({ ...input, visualDescription: description });
    const bR = await this.llm.chatOnce({
      systemPrompt: b.system,
      messages: [{ role: "user", content: b.user }],
      temperature: 0.3,
      maxTokens: 2500,
      stream: false
    });
    if (bR.kind === "error") {
      warnings.push(`[phase3b·spec] 失败：${bR.message}`);
      return null;
    }
    let specObj = extractJSON(bR.text);
    if (!specObj) {
      warnings.push("[phase3b·spec] LLM 未返回合法 JSON");
      return null;
    }

    const c = buildAppearanceCritiquePrompt({
      ...input,
      specJson: JSON.stringify(specObj)
    });
    const cR = await this.llm.chatOnce({
      systemPrompt: c.system,
      messages: [{ role: "user", content: c.user }],
      temperature: 0.2,
      maxTokens: 2500,
      stream: false
    });
    if (cR.kind === "done") {
      const critiquedObj = extractJSON(cR.text);
      if (critiquedObj) specObj = critiquedObj;
    }

    const parsed = AppearanceSpecSchema.safeParse(specObj);
    if (parsed.success) return this.stampReferenceImages(parsed.data, []);
    warnings.push(
      `[phase3b·fallback] 校验失败：${parsed.error.errors.slice(0, 6).map((e) => e.path.join(".")).join(", ")}`
    );
    return null;
  }

  /** 把本次用到的参考图清单印到 spec 上，供"重新生成形象"复用。 */
  private stampReferenceImages(
    spec: AppearanceSpec,
    refs: ReferenceImageInput[]
  ): AppearanceSpec {
    if (refs.length === 0) {
      return { ...spec, referenceImages: spec.referenceImages ?? [] };
    }
    return {
      ...spec,
      referenceImages: refs.map((r) => ({
        source: r.source,
        url: r.url,
        role: r.role ?? "reference",
        notes: r.notes ?? ""
      }))
    };
  }

  /**
   * 「重新生成形象」管道（深度版同款，但不动人格 / 调研档案）。
   * 复用旧 referenceImages，或接受新的覆盖。
   */
  async regenerateAppearance(input: {
    card: CharacterCard;
    referenceImages?: ReferenceImageInput[];
    userHint?: string;
  }): Promise<RegenerateAppearanceResult> {
    const warnings: string[] = [];
    const refsFromCard = (input.card.meta.appearance?.referenceImages ?? []).map(
      (r) => ({ url: r.url, source: r.source, role: r.role, notes: r.notes })
    ) as ReferenceImageInput[];
    const refs = input.referenceImages?.length
      ? input.referenceImages
      : refsFromCard;
    const userHint = input.userHint ?? "";

    const appearance = await this.runAppearanceDeep(
      {
        characterName: input.card.meta.name,
        sourceName: input.card.meta.sourceName,
        sourceType: input.card.meta.sourceType,
        track: input.card.meta.track,
        userHint,
        referenceImages: refs
      },
      // 没图但允许搜：默认允许
      true,
      warnings,
      undefined
    );
    if (!appearance) {
      return { ok: false, error: "外貌生成失败", warnings };
    }
    const sprite = await this.runVisualStep(
      input.card.meta.name,
      input.card.meta.sourceType,
      appearance,
      refs,
      warnings
    );
    if (!sprite) {
      return { ok: false, appearance, error: "sprite 生成失败", warnings };
    }
    return { ok: true, appearance, sprite, warnings };
  }

  /**
   * 深度蒸馏要求联网时，先做一次真实 web_search 凭证检查。
   * 这样不会再出现"开了联网但整轮靠训练知识硬编"。
   */
  private async verifyWebSearchReady(config: DistillationJobConfig): Promise<string | null> {
    const result = await this.llm.chatWithTools({
      systemPrompt: "你是联网能力探测器。必须使用 web_search，并在回答中保留来源引用。",
      messages: [
        {
          role: "user",
          content:
            "请联网查询 2024 年诺贝尔物理学奖官方公告页 URL。只回答一句中文，并保留来源引用。"
        }
      ],
      temperature: 0.2,
      maxTokens: 300,
      stream: false,
      enableWebSearch: true,
      maxToolCalls: 2,
      modelOverride: config.researchModel,
      searchContextSize: "low"
    });
    if (result.kind === "error") {
      return `联网调研实测失败：${result.message}`;
    }
    const usedTool = result.toolEvents.some((e) => e.kind === "tool_start");
    if (!usedTool || result.citations.length === 0) {
      return (
        "联网调研实测失败：模型没有返回可验证的 web_search 工具事件和 URL citation。" +
        "请切换到 OpenAI 直连 search-preview/search-api 模型，或支持 server-side web_search 的 Anthropic 模型。"
      );
    }
    return null;
  }

  /**
   * 方案 B：参考图分层 + CSS 骨骼桌宠生成。
   * 有参考图时 vision 提取 rig（眼位/边界）；无图时从 AppearanceSpec 生成 CSS 插画层。
   */
  private async runVisualStep(
    characterName: string,
    sourceType: "public-figure" | "fictional" | "original",
    appearance: AppearanceSpec,
    referenceImages: ReferenceImageInput[],
    warnings: string[]
  ): Promise<SpriteProgram | null> {
    try {
      let rigHints: LayeredRigHints | null = null;
      const vis = this.llm.detectVisionCapability();
      if (vis.vision && referenceImages.length > 0) {
        rigHints = await this.extractLayeredRigHints(
          characterName,
          sourceType,
          referenceImages,
          warnings
        );
      }
      const sprite = buildLayeredPetFromAppearance({
        appearance,
        referenceImages,
        characterName,
        rigHints
      });
      const parsed = parseSprite(sprite);
      if (parsed.ok && parsed.data) return parsed.data;
      warnings.push(
        `[step3·layered] 校验失败：${(parsed.errors ?? [])
          .map((e) => `${e.path}=${e.message}`)
          .slice(0, 4)
          .join(" | ")}`
      );
      return null;
    } catch (e) {
      warnings.push(
        `[step3·layered] 生成异常：${e instanceof Error ? e.message : String(e)}`
      );
      return null;
    }
  }

  /** Vision 读参考图，提取 CSS rig 元数据（眼位、角色边界、个性动作）。 */
  private async extractLayeredRigHints(
    characterName: string,
    sourceType: "public-figure" | "fictional" | "original",
    referenceImages: ReferenceImageInput[],
    warnings: string[]
  ): Promise<LayeredRigHints | null> {
    const refs = referenceImages.slice(0, 2);
    const { system, user } = buildLayeredRigVisionPrompt({
      characterName,
      sourceType,
      referenceImageCount: refs.length
    });
    const content: ChatContentPart[] = [{ type: "text", text: user }];
    for (const ref of refs) {
      content.push({ type: "image", url: ref.url, detail: "high" });
    }
    const r = await this.llm.chatOnce({
      systemPrompt: system,
      messages: [{ role: "user", content }],
      temperature: 0.15,
      maxTokens: 800,
      stream: false
    });
    if (r.kind === "error") {
      warnings.push(`[step3·rig] vision 读图失败：${r.message}`);
      return null;
    }
    const obj = extractJSON(r.text) as Record<string, unknown> | null;
    if (!obj) {
      warnings.push("[step3·rig] 未返回合法 JSON，使用默认眼位");
      return null;
    }
    const hints: LayeredRigHints = {};
    const bounds = obj.characterBounds as Record<string, number> | undefined;
    if (bounds && typeof bounds.x === "number") {
      hints.characterBounds = {
        x: clamp01(bounds.x),
        y: clamp01(bounds.y ?? 0),
        w: clamp01(bounds.w ?? 0.9),
        h: clamp01(bounds.h ?? 0.9)
      };
    }
    const le = obj.leftEye as Record<string, number> | undefined;
    if (le && typeof le.x === "number") {
      hints.leftEye = {
        x: clamp01(le.x),
        y: clamp01(le.y ?? 0.38),
        size: Math.min(16, Math.max(6, le.size ?? 9))
      };
    }
    const re = obj.rightEye as Record<string, number> | undefined;
    if (re && typeof re.x === "number") {
      hints.rightEye = {
        x: clamp01(re.x),
        y: clamp01(re.y ?? 0.38),
        size: Math.min(16, Math.max(6, re.size ?? 9))
      };
    }
    if (typeof obj.hasTransparentBg === "boolean") {
      hints.hasTransparentBg = obj.hasTransparentBg;
    }
    const sig = obj.signature;
    if (
      typeof sig === "string" &&
      ["wave", "nod", "bounce", "salute", "sparkle", "flex"].includes(sig)
    ) {
      hints.signature = sig as LayeredRigHints["signature"];
    }
    return hints;
  }
}

const AGENT_SLUG_TO_ID: Record<string, ResearchAgentId> = {
  writings: 1,
  conversations: 2,
  "expression-dna": 3,
  "external-views": 4,
  decisions: 5,
  timeline: 6
};

function phaseEvent(
  jobId: string,
  phase: DistillationJob["status"],
  progress: number,
  message: string
): DeepProgressEvent {
  return { kind: "phase", jobId, phase, progress, message };
}

/**
 * 把 vision-verify 返回的 suggestions 浅合并到 spec 对象上。
 * suggestions 支持 a.b.c 形式的扁平 key（如 "eyes.color.hex": "#3aa0e0"）
 * 和直接顶层 key（如 "gender": "female"）。
 *
 * 浅合并：只覆盖明确写出的路径，不影响其他字段；目标路径不存在时按嵌套对象创建。
 */
function mergeSpecPatches(
  base: Record<string, unknown>,
  patches: Record<string, unknown>
): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const [key, val] of Object.entries(patches)) {
    if (!key) continue;
    const path = key.split(".");
    let cur: Record<string, unknown> = out;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i]!;
      const next = cur[k];
      if (next == null || typeof next !== "object" || Array.isArray(next)) {
        cur[k] = {};
      }
      cur = cur[k] as Record<string, unknown>;
    }
    cur[path[path.length - 1]!] = val;
  }
  return out;
}

function extractJSON(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through
    }
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1] ?? "");
    } catch {
      // ignore
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // ignore
    }
  }
  return null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
