import { ulid } from "ulid";
import {
  AppearanceSpecSchema,
  parseSprite,
  applyCharacterNamesToMeta,
  normalizeCharacterNames,
  needsCharacterNameLookup,
  normalizeChineseNameDots,
  isPinyinFallbackEnglish,
  needsQuoteLookup,
  needsQuoteTranslation,
  isQuoteAcceptable,
  isChineseNativeForQuote,
  chineseNameToPinyinEnglish,
  normalizeQuoteOneLiner,
  isSkeletonPlaceholderQuote,
  effectiveQuoteOneLiner,
  deriveQuoteStatus,
  type CharacterNamePair,
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
  type HatchPetRowState,
  type QualityReport,
  type ResearchAgentId,
  type ResearchDoc,
  type SpriteProgram
} from "@bailin/character-protocol";
import {
  buildAppearanceCritiquePrompt,
  buildAppearanceImageSearchPrompt,
  buildAppearanceResearchPrompt,
  buildAppearanceSpecPrompt,
  buildAppearanceVisionExtractionPrompt,
  buildAppearanceVisionVerificationPrompt,
  buildCharacterNameResolutionPrompt,
  buildCharacterQuoteResolutionPrompt,
  buildCharacterQuoteTranslationPrompt,
  type ResearchAgentSlug
} from "@bailin/prompts";
import type { LLMAdapter, ChatContentPart } from "../adapters/llm-adapter.js";
import { runResearchAgents, agentIdsToSlugs, type AgentResearchPlan } from "./research-pipeline.js";
import {
  buildCanonicalIdentityFromInput,
  resolveSourceContextPriority
} from "./resolve-source-context.js";
import {
  anyAgentNeedsWebSearch,
  buildAgentPlansFromCoverage,
  buildLocalOnlyAgentPlans,
  buildWebAgentPlans,
  classifyMaterialCoverage,
  coverageSummaryForWarning,
  formatCoveragePlanMessage,
  resolveEffectiveMaterialMode
} from "./material-coverage-plan.js";
import {
  APPEARANCE_PHASE_FALLBACK_NO_IMAGES,
  APPEARANCE_PHASE_FALLBACK_NO_VISION,
  APPEARANCE_PHASE_FALLBACK_VISION_FAILED,
  buildAppearancePhaseMessage
} from "../../shared/appearance-phase-message.js";
import { runQualityCheck } from "./quality-check.js";
import { checkQuoteEvidence } from "./quote-evidence.js";
import {
  annotateQualityWeaknesses,
  applyResynthesisPatch,
  MAX_SYNTHESIS_ROUNDS,
  runTargetedResynthesis,
  runTwoPhaseSynthesis,
  shouldTriggerResynthesis,
  ensureAnswerProtocol
} from "./synthesis-pipeline.js";
import {
  mergeResearchDocs,
  mergeResearchSummary,
  summarizeResearchRun
} from "./merge-research-summary.js";
import type {
  DistillationApprovalResult,
  ResearchSummaryPayload,
  SynthesisSummaryPayload
} from "../../shared/ipc-contract.js";
import {
  HatchPetPipeline,
  type HatchProgressEvent
} from "../hatch/hatch-pet-pipeline.js";
import type { ImageGenerationAdapter } from "../adapters/image-generation-adapter.js";
import type { LocalVault } from "../store/local-vault.js";
import type { HatchProgressEventDTO } from "../../shared/ipc-contract.js";
import { buildSpriteFromAppearance } from "../runtime/sprite-builder.js";

/** 一张供 vision pipeline 使用的参考图。 */
export interface ReferenceImageInput {
  url: string;
  source: "user-upload" | "web";
  role?: "primary" | "reference";
  notes?: string;
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

export interface RegenerateQuoteResult {
  ok: boolean;
  card?: CharacterCard;
  quoteStatus?: "verified" | "provisional" | "missing";
  quoteOneLiner?: string;
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
  | { kind: "hatch_progress"; jobId: string; event: HatchProgressEventDTO }
  | {
      kind: "sprite_incomplete";
      jobId: string;
      failedRows: HatchPetRowState[];
      totalCostUsd: number;
      rowFailures?: Partial<Record<HatchPetRowState, string>>;
    }
  | { kind: "done"; jobId: string; bundle: CharacterBundle; isSkeleton: boolean; warnings: string[] }
  | { kind: "failed"; jobId: string; reason: string; warnings: string[] }
  | { kind: "cancelled"; jobId: string };

/**
 * 深度蒸馏入参：来自 IPC，已经被 DistillationJobConfigSchema 校验。
 */
export interface DeepOrchestrateInput {
  jobId: string;
  config: DistillationJobConfig;
  /** 上层用于在 Checkpoint 等待用户确认；resolve 后继续；reject 则取消。 */
  awaitApproval: (phase: "research" | "sprite") => Promise<DistillationApprovalResult>;
  /** 是否启用风格测试（额外 LLM 调用），默认 true。 */
  runVoiceTest?: boolean;
  /**
   * 可选「实时事件回调」：用于 hatch-pet 这种非 generator 的子流程把进度
   * 即刻推到前端，而不必等 runVisualStep 整体完成再批量 yield。
   * register.ts 会把它接成 broadcast(IPC.EventDistillationProgress, evt)。
   */
  liveBroadcast?: (evt: DeepProgressEvent) => void;
  signal?: AbortSignal;
}

export class BailinOrchestrator {
  private hatchPipeline: HatchPetPipeline | null;
  /** 座右铭手动重试并发锁（characterId）。 */
  private quoteJobs = new Set<string>();

  constructor(
    private llm: LLMAdapter,
    options?: {
      imageGen?: ImageGenerationAdapter;
      vault?: LocalVault;
    }
  ) {
    this.hatchPipeline =
      options?.imageGen && options?.vault
        ? new HatchPetPipeline({ imageGen: options.imageGen, vault: options.vault })
        : null;
  }

  /** 是否可以走 hatch-pet 主路径；UI 可据此切换提示。 */
  hasHatchCapability(): boolean {
    return this.hatchPipeline !== null;
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
    const visual = await this.runVisualStep(
      input.card.id,
      input.card.meta.name,
      input.card.meta.sourceType,
      appearance,
      refs,
      warnings
    );
    if (!visual.sprite) {
      return {
        ok: false,
        error: warnings[warnings.length - 1] ?? "形象生成失败",
        warnings,
        sprite: makeSkeletonSprite(input.card.meta.track)
      };
    }
    return { ok: true, sprite: visual.sprite, warnings };
  }

  /**
   * 只重跑座右铭核验流水线：不动人格 / 外貌 / sprite。
   * 与创建时 finalizeCharacterQuote 共用 resolve 策略。
   */
  async regenerateQuote(input: { card: CharacterCard }): Promise<RegenerateQuoteResult> {
    const characterId = input.card.id;
    if (this.quoteJobs.has(characterId)) {
      return { ok: false, error: "座右铭正在核实中", warnings: [] };
    }
    this.quoteJobs.add(characterId);
    const warnings: string[] = [];
    try {
      const card: CharacterCard = structuredClone(input.card);
      // 强制重新检索：清掉旧原话与状态后再走 finalize
      card.meta.quoteOneLiner = undefined;
      card.meta.quoteStatus = undefined;
      card.meta.quoteStatusReason = undefined;
      await this.finalizeCharacterQuote(
        card,
        card.meta.sourceType,
        this.metadataWebSearchEnabled(card.meta.sourceType),
        warnings
      );
      const quoteStatus =
        card.meta.quoteStatus ??
        deriveQuoteStatus({
          quoteOneLiner: card.meta.quoteOneLiner,
          quoteStatus: card.meta.quoteStatus,
          signatureVocabulary: card.expressionDNA.vocabulary.signature,
          selfIntro: card.identity.selfIntro
        });
      card.meta.quoteStatus = quoteStatus;
      return {
        ok: quoteStatus === "verified",
        card,
        quoteStatus,
        quoteOneLiner: card.meta.quoteOneLiner,
        warnings,
        error:
          quoteStatus === "verified"
            ? undefined
            : card.meta.quoteStatusReason ?? "仍未能核实代表性原话"
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        warnings
      };
    } finally {
      this.quoteJobs.delete(characterId);
    }
  }

  /**
   * 深度蒸馏 async generator：对齐百灵完整流程。
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
    const { jobId } = input;
    const config: DistillationJobConfig = {
      ...input.config,
      researchModel: this.llm.getWebSearchModel()
    };
    const warnings: string[] = [];
    const aborted = (): boolean => input.signal?.aborted === true;
    const yieldWarn = (msg: string) => {
      warnings.push(msg);
      return { kind: "warning" as const, jobId, message: msg };
    };

    yield { kind: "started", jobId };

    // ===== 身份契约：调研前解析一次，后续名称 / 调研 / 台词 / 搜图 / 外貌全部只消费这一个对象 =====
    // 关键修复（Tatsumi bad case）：以前 config.characterName 里像
    // "斩赤红之瞳 男主角 塔兹米" 这种复合输入会被原样传给调研 / 命名 / 台词 / 搜图，
    // 各步骤各自猜测消歧义，经常猜错成同名其它角色。现在先拆分一次，
    // 干净角色名 + sourceContext + identityHint 贯穿后续所有步骤。
    const identity = buildCanonicalIdentityFromInput({
      characterName: config.characterName,
      sourceContext: config.sourceContext,
      sourceType: config.sourceType
    });
    config.characterName = identity.characterName;
    if (identity.sourceContext) config.sourceContext = identity.sourceContext;
    const identityHint = identity.identityHint;
    if (identity.rawInput !== identity.characterName) {
      yield yieldWarn(
        `[identity·split] 已从输入「${identity.rawInput}」拆出角色名「${identity.characterName}」` +
          (identity.sourceContext ? `，出处锚点「${identity.sourceContext}」` : "") +
          (identityHint ? `，身份提示「${identityHint}」` : "")
      );
    }

    // ===== Phase 1: 6 Agent 并行调研 =====
    const effectiveMaterialMode = resolveEffectiveMaterialMode(config);
    let agentPlans: AgentResearchPlan[];
    let coverageResult: Awaited<ReturnType<typeof classifyMaterialCoverage>> = null;

    if (effectiveMaterialMode === "local-only") {
      agentPlans = buildLocalOnlyAgentPlans();
    } else if (effectiveMaterialMode === "local-first" && config.userMaterial?.trim()) {
      yield phaseEvent(jobId, "researching", 3, "分析用户素材覆盖范围…");
      coverageResult = await classifyMaterialCoverage(this.llm, config);
      if (coverageResult) {
        const coveragePlans = buildAgentPlansFromCoverage(coverageResult, config.enableWebSearch);
        agentPlans = coveragePlans.plans;
        for (const agentId of coveragePlans.downgradedAgentIds) {
          yield yieldWarn(`Agent ${agentId} 本地摘要偏短，已改为本地整理（不联网）`);
        }
        yield yieldWarn(`本地素材优先：${coverageSummaryForWarning(coverageResult)}`);
      } else {
        yield yieldWarn("素材覆盖分类失败，将回退为全网调研。");
        agentPlans = buildWebAgentPlans(config.enableWebSearch);
      }
    } else {
      agentPlans = buildWebAgentPlans(config.enableWebSearch);
    }

    const phaseMessage = formatCoveragePlanMessage(effectiveMaterialMode, coverageResult, agentPlans);
    yield phaseEvent(jobId, "researching", 5, phaseMessage);

    const needsWebVerify = anyAgentNeedsWebSearch(agentPlans);
    if (needsWebVerify) {
      const webReadyError = await this.verifyWebSearchReady(config);
      if (webReadyError) {
        yield yieldWarn(webReadyError);
        yield { kind: "failed", jobId, reason: webReadyError, warnings };
        return;
      }
    }
    // 在调研前先做一次"原作上下文 + 英文名"的智能解析，让 6 路调研都能用稳定的消歧义短语。
    const { sourceContext, englishName } = await this.resolveResearchContext(
      config,
      warnings
    );
    if (sourceContext || englishName) {
      yield phaseEvent(
        jobId,
        "researching",
        8,
        `已锁定调研对象：${config.characterName}` +
          (englishName ? ` / ${englishName}` : "") +
          (sourceContext ? `（${sourceContext}）` : "")
      );
    }
    const agentEventBuffer: DeepProgressEvent[] = [];
    const researchStartedAt = Date.now();
    let researchDocs = (
      await this.runResearchAgentsForJob(
        config,
        { sourceContext, englishName },
        jobId,
        agentEventBuffer,
        input,
        undefined,
        agentPlans
      )
    ).docs;
    for (const evt of agentEventBuffer) yield evt;

    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

    // ===== Checkpoint 1: Phase 1.5 调研 Review（可定向补跑）=====
    while (true) {
      const { okCount, failedCount } = summarizeResearchRun(researchDocs);
      const researchSummary = buildResearchSummaryPayload(
        researchDocs,
        Date.now() - researchStartedAt,
        okCount,
        failedCount,
        effectiveMaterialMode
      );
      yield { kind: "research_complete", jobId, summary: researchSummary };
      yield phaseEvent(
        jobId,
        "awaiting_research_ok",
        30,
        `调研完成（成功 ${okCount}/6，失败 ${failedCount}），等待你确认`
      );

      let approval: DistillationApprovalResult;
      try {
        approval = await input.awaitApproval("research");
      } catch {
        yield { kind: "cancelled", jobId };
        return;
      }
      if (aborted()) {
        yield { kind: "cancelled", jobId };
        return;
      }

      const supplementalIds = (approval.supplementalAgentIds ?? []).filter(
        (id) => id >= 1 && id <= 6
      );
      if (supplementalIds.length === 0) break;

      const slugs = agentIdsToSlugs(supplementalIds);
      if (slugs.length === 0) break;

      yield phaseEvent(
        jobId,
        "researching",
        28,
        `补跑 ${slugs.length} 路调研…`
      );

      const supplementBuffer: DeepProgressEvent[] = [];
      const supplemental = await this.runResearchAgentsForJob(
        config,
        { sourceContext, englishName },
        jobId,
        supplementBuffer,
        input,
        slugs
      );
      for (const evt of supplementBuffer) yield evt;
      researchDocs = mergeResearchDocs(researchDocs, supplemental.docs);

      if (aborted()) {
        yield { kind: "cancelled", jobId };
        return;
      }
    }

    const research = {
      docs: researchDocs,
      ...summarizeResearchRun(researchDocs),
      totalDurationMs: Date.now() - researchStartedAt
    };

    // ===== Phase 2: 两阶段框架提炼 =====
    yield phaseEvent(jobId, "synthesizing", 40, "正在用调研结果提炼心智模型与表达风格…");
    let synthesisRound = 1;
    const twoPhaseResult = await runTwoPhaseSynthesis(
      this.llm,
      config,
      research.docs,
      warnings
    );
    let synthCard = twoPhaseResult.card;
    let synthesisPassA = twoPhaseResult.passA;
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
    yield phaseEvent(jobId, "synthesizing", 55, "提炼完成，继续装配人格卡…");

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

    await this.finalizeCharacterNames(
      card,
      config.characterName,
      config.sourceType,
      this.metadataWebSearchEnabled(config.sourceType),
      warnings,
      config.researchModel,
      sourceContext ?? config.sourceContext,
      identityHint
    );

    await this.finalizeCharacterQuote(
      card,
      config.sourceType,
      this.metadataWebSearchEnabled(config.sourceType),
      warnings,
      config.researchModel,
      config.userMaterial,
      sourceContext ?? config.sourceContext,
      identityHint
    );

    // ===== Phase 3b: 深度外貌（vision-first 流程） =====
    const appearanceRefs: ReferenceImageInput[] = [...(config.referenceImages ?? [])];
    if (
      config.userImageRef &&
      !appearanceRefs.some((r) => r.url === config.userImageRef)
    ) {
      appearanceRefs.push({
        url: config.userImageRef,
        source: "user-upload",
        role: "primary",
        notes: "userImageRef (legacy)"
      });
    }
    const userUploadedRefCount = appearanceRefs.filter((r) => r.source === "user-upload").length;
    const visCap = this.llm.detectVisionCapability();
    const emitAppearanceStatus = (message: string, progress = 72): void => {
      const evt = phaseEvent(jobId, "researching_appearance", progress, message);
      input.liveBroadcast?.(evt);
    };
    yield phaseEvent(
      jobId,
      "researching_appearance",
      70,
      buildAppearancePhaseMessage({
        userReferenceCount: userUploadedRefCount,
        webSearchEnabled: config.enableWebSearch,
        visionAvailable: visCap.vision
      })
    );
    const appearance = await this.resolveAppearanceWithEvidenceGate(
      {
        characterName: config.characterName,
        sourceName: card.meta.sourceName,
        sourceType: config.sourceType,
        track: config.track,
        userHint: config.userHint,
        userMaterial: config.userMaterial,
        sourceContext: sourceContext ?? config.sourceContext,
        identityHint,
        referenceImages: appearanceRefs,
        onStatusMessage: emitAppearanceStatus
      },
      config.enableWebSearch,
      warnings,
      config.researchModel,
      config.sourceType
    );
    if (appearance) {
      card.meta.appearance = appearance;
      card.meta.avatarHint = summarizeAppearance(appearance);
      yield { kind: "appearance_ready", jobId, appearance };
    }

    // ===== Phase 3c: 形象（atlas 优先，CSS 兜底）=====
    yield phaseEvent(jobId, "building_sprite", 80, "正在绘制桌宠像素形象…");
    // 关键：即使 phase3b 的 vision 链路失败、appearance 为 null，也要给一个最小默认 appearance，
    // 让 gpt-image-2 始终有机会跑起来。这样用户至少能拿到一只"AI 画的桌宠"，
    // 而不是骨架占位图。重新生成形象时还可以补素材。
    const appearanceForSprite: AppearanceSpec =
      appearance ??
      makeMinimalAppearance(config.characterName, config.sourceType, config.track);
    if (appearance == null) {
      // 把这个最小外貌也写回到 card 上，避免「重画形象」按钮没东西可用
      card.meta.appearance = appearanceForSprite;
      card.meta.avatarHint = summarizeAppearance(appearanceForSprite);
    }
    let visualResult = await this.runVisualStep(
      cardId,
      config.characterName,
      config.sourceType,
      appearanceForSprite,
      appearanceRefs,
      warnings,
      (evt) => {
        input.liveBroadcast?.({
          kind: "hatch_progress",
          jobId,
          event: toHatchDTO(evt)
        });
      },
      input.signal
    );
    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }
    let finalSprite: SpriteProgram = visualResult.sprite ?? skeleton.sprite;

    while (visualResult.failedRows.length > 0) {
      if (aborted()) {
        yield { kind: "cancelled", jobId };
        return;
      }
      yield {
        kind: "sprite_incomplete",
        jobId,
        failedRows: visualResult.failedRows,
        totalCostUsd: visualResult.totalCostUsd,
        rowFailures: visualResult.failedRowReasons
      };
      yield phaseEvent(
        jobId,
        "awaiting_sprite_ok",
        85,
        `${visualResult.failedRows.length} 个姿态生成失败，等待确认`
      );

      let approval: DistillationApprovalResult;
      try {
        approval = await input.awaitApproval("sprite");
      } catch {
        yield { kind: "cancelled", jobId };
        return;
      }

      if (approval.spriteAction !== "retry" || !this.hatchPipeline) {
        break;
      }

      const rowsToRetry = approval.spriteRetryRows ?? visualResult.failedRows;
      yield phaseEvent(
        jobId,
        "building_sprite",
        82,
        `正在重试 ${rowsToRetry.length} 个失败姿态…`
      );

      const retryResult = await this.hatchPipeline.retryRows(
        {
          characterId: cardId,
          characterName: config.characterName,
          appearance: appearanceForSprite,
          userReferences: appearanceRefs,
          onProgress: (evt) => {
            input.liveBroadcast?.({
              kind: "hatch_progress",
              jobId,
              event: toHatchDTO(evt)
            });
          },
          signal: input.signal
        },
        rowsToRetry
      );

      for (const w of retryResult.warnings) {
        warnings.push(`[step3·hatch-retry] ${w}`);
      }
      if (retryResult.errors.length > 0) {
        yield yieldWarn(`[step3·hatch-retry] ${retryResult.errors.join(" | ")}`);
        break;
      }
      if (retryResult.program) {
        const parsed = parseSprite(retryResult.program);
        if (parsed.ok && parsed.data) {
          finalSprite = parsed.data;
        }
      }
      visualResult = {
        sprite: finalSprite,
        failedRows: retryResult.failedRows,
        totalCostUsd: retryResult.totalCostUsd,
        failedRowReasons: retryResult.failedRowReasons
      };
    }

    finalSprite.schemaVersion = SCHEMA_VERSION;

    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

    // ===== Phase 4: 质量自检（含定向重提炼闭环，最多 MAX_SYNTHESIS_ROUNDS 轮）=====
    let qualityReport: QualityReport | undefined;

    yield phaseEvent(jobId, "quality_check", 90, "运行质量自检…");
    try {
      qualityReport = await runQualityCheck(this.llm, {
        card,
        researchDocs: research.docs,
        runVoiceTest: input.runVoiceTest ?? true
      });
      qualityReport.synthesisRounds = synthesisRound;
      yield { kind: "quality_report", jobId, report: qualityReport };
    } catch (e) {
      yield yieldWarn(
        `[phase4·quality] 自检失败：${e instanceof Error ? e.message : String(e)}`
      );
    }

    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

    while (
      qualityReport &&
      shouldTriggerResynthesis(qualityReport) &&
      synthesisRound < MAX_SYNTHESIS_ROUNDS
    ) {
      if (aborted()) {
        yield { kind: "cancelled", jobId };
        return;
      }

      synthesisRound += 1;
      yield phaseEvent(
        jobId,
        "synthesizing",
        42,
        `第 ${synthesisRound} 轮提炼中：正在优化思维框架与表达逻辑，不影响外貌与桌宠绘制`
      );

      const patch = await runTargetedResynthesis(
        this.llm,
        config,
        research.docs,
        card,
        qualityReport,
        synthesisPassA,
        warnings
      );
      if (patch) {
        applyResynthesisPatch(card, patch);
        if (synthCard) {
          synthCard.mentalModels = card.mentalModels;
          synthCard.heuristics = card.heuristics;
        }
        await ensureAnswerProtocol(this.llm, card, warnings);
      } else {
        yield yieldWarn("[phase2·retry] 定向重提炼未产出有效 patch，停止迭代");
        break;
      }

      yield phaseEvent(jobId, "quality_check", 90, "运行质量自检…");
      try {
        qualityReport = await runQualityCheck(this.llm, {
          card,
          researchDocs: research.docs,
          runVoiceTest: input.runVoiceTest ?? true
        });
        qualityReport.synthesisRounds = synthesisRound;
        yield { kind: "quality_report", jobId, report: qualityReport };
      } catch (e) {
        yield yieldWarn(
          `[phase4·quality] 自检失败：${e instanceof Error ? e.message : String(e)}`
        );
        break;
      }
    }

    if (qualityReport && shouldTriggerResynthesis(qualityReport)) {
      annotateQualityWeaknesses(card, qualityReport, synthesisRound);
      yield yieldWarn(
        `[phase4·quality] 已达 ${synthesisRound} 轮提炼上限，已在诚实边界标注薄弱项后交付`
      );
    }

    // 注意：appearance 即使为 null 也会用 minimalAppearance 兜底进 sprite，
    // 因此 sprite 通常非 null。"骨架"严格定义为「人格 + 真实外貌 + sprite 三步全失败」。
    const isSkeleton =
      synthCard == null && appearance == null && finalSprite == null;

    if (aborted()) {
      yield { kind: "cancelled", jobId };
      return;
    }

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

  private async runResearchAgentsForJob(
    config: DistillationJobConfig,
    context: { sourceContext?: string; englishName?: string },
    jobId: string,
    eventBuffer: DeepProgressEvent[],
    input: DeepOrchestrateInput,
    onlyAgents?: ResearchAgentSlug[],
    agentPlans?: AgentResearchPlan[]
  ) {
    const webEnabled =
      agentPlans != null
        ? anyAgentNeedsWebSearch(agentPlans)
        : config.enableWebSearch;

    return runResearchAgents(this.llm, {
      characterName: config.characterName,
      sourceType: config.sourceType,
      track: config.track,
      userMaterial: config.userMaterial,
      sourceContext: context.sourceContext,
      englishName: context.englishName,
      webSearchEnabled: webEnabled,
      concurrency: config.concurrency,
      timeoutMs: config.agentTimeoutMs,
      researchModel: config.researchModel,
      onlyAgents,
      agentPlans,
      signal: input.signal,
      onAgentStart: (slug, agentName) => {
        const id = AGENT_SLUG_TO_ID[slug];
        if (id == null) return;
        const evt: DeepProgressEvent = { kind: "agent_start", jobId, agentId: id, agentName };
        eventBuffer.push(evt);
        input.liveBroadcast?.(evt);
      },
      onAgentDone: (doc) => {
        const evt: DeepProgressEvent = { kind: "agent_done", jobId, doc };
        eventBuffer.push(evt);
        input.liveBroadcast?.(evt);
      }
    });
  }

  /** 旧的纯文本一次性 prompt（fallback）。 */
  private async runAppearanceTextOnly(
    input: {
      characterName: string;
      sourceType: "public-figure" | "fictional" | "original";
      track: "utility" | "companion";
      userHint?: string;
      userMaterial?: string;
      sourceContext?: string;
    },
    warnings: string[]
  ): Promise<AppearanceSpec | null> {
    const { system, user } = buildAppearanceResearchPrompt({
      characterName: input.characterName,
      sourceType: input.sourceType,
      track: input.track,
      userHint: input.userHint,
      userMaterial: input.userMaterial,
      sourceContext: input.sourceContext
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

  /** 解析并写回 meta.chineseName / meta.englishName，同时同步 name / sourceName。 */
  private metadataWebSearchEnabled(
    sourceType: CharacterCard["meta"]["sourceType"]
  ): boolean {
    if (sourceType === "original") return false;
    return this.llm.detectCapabilities().webSearch;
  }

  /** 解析并写回 meta.chineseName / meta.englishName，同时同步 name / sourceName。 */
  private async finalizeCharacterNames(
    card: CharacterCard,
    inputCharacterName: string,
    sourceType: CharacterCard["meta"]["sourceType"],
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string,
    sourceContext?: string,
    identityHint?: string
  ): Promise<void> {
    let names = normalizeCharacterNames({
      inputName: inputCharacterName,
      name: card.meta.name,
      sourceName: card.meta.sourceName,
      chineseName: card.meta.chineseName,
      englishName: card.meta.englishName
    });

    if (needsCharacterNameLookup(names, sourceType)) {
      const resolved = await this.runNameResolutionStep(
        inputCharacterName,
        sourceType,
        {
          name: card.meta.name,
          sourceName: card.meta.sourceName,
          chineseName: card.meta.chineseName,
          englishName: card.meta.englishName
        },
        webSearchEnabled,
        warnings,
        researchModel,
        sourceContext,
        identityHint
      );
      if (resolved) {
        const normalizedChinese = normalizeChineseNameDots(resolved.chineseName);
        const normalizedEnglish = resolved.englishName.trim();
        if (
          sourceType !== "original" &&
          isPinyinFallbackEnglish(normalizedChinese, normalizedEnglish)
        ) {
          warnings.push(
            "[name·lookup] 检索结果仍为拼音英文名，可能未命中正确人物，请检查模型联网能力"
          );
        }
        names = normalizeCharacterNames({
          inputName: inputCharacterName,
          chineseName: normalizedChinese,
          englishName: normalizedEnglish,
          name: normalizedChinese,
          sourceName: normalizedEnglish
        });
      }
    }

    applyCharacterNamesToMeta(card.meta, names);
  }

  /**
   * 调研开始前的"消歧义解析"：拿到角色的英文名 + 原作上下文，
   * 用最便宜的方式让后续 6 路 search-preview 都能搜对人。
   *
   * 来源优先级（见 resolveSourceContextPriority）：
   *   1. 用户显式填写的 sourceContext
   *   2. userMaterial / userHint 中的《XX》/ 括号上下文
   *   3. original → 跳过；其它 → LLM 猜「最广为人知」+ englishName
   */
  private async resolveResearchContext(
    config: DistillationJobConfig,
    warnings: string[]
  ): Promise<{ sourceContext?: string; englishName?: string }> {
    const priority = resolveSourceContextPriority({
      sourceContext: config.sourceContext,
      userHint: config.userHint,
      userMaterial: config.userMaterial,
      sourceType: config.sourceType
    });

    if (priority.kind === "explicit" || priority.kind === "hint") {
      return { sourceContext: priority.sourceContext, englishName: undefined };
    }
    if (priority.kind === "none") {
      return {};
    }

    // needs_llm：不联网的 LLM 一次调用
    const sys =
      "你是消歧义助手。只返回严格 JSON：{ \"sourceContext\": \"<最广为人知的作品/职业/身份，1-12 字>\", \"englishName\": \"<英文或原文名，若无则空字符串>\" }。" +
      "不要解释，不要 Markdown。如果该名字有多个常见身份，选最广为人知的一个。";
    const promptName =
      config.sourceType === "fictional"
        ? `角色名：「${config.characterName}」（已知是虚构 / 二次元角色）`
        : `人物名：「${config.characterName}」（已知是公众人物 / 真人）`;
    const user = `${promptName}\n请回答 sourceContext（所属作品 / 职业 / 国家+身份）和 englishName。`;
    try {
      const r = await this.llm.chatOnce({
        systemPrompt: sys,
        messages: [{ role: "user", content: user }],
        temperature: 0.1,
        maxTokens: 200,
        stream: false
      });
      if (r.kind === "error") {
        warnings.push(`[research·context-resolve] LLM 失败：${r.message.slice(0, 100)}`);
        return {};
      }
      const json = extractJSON(r.text) as
        | { sourceContext?: unknown; englishName?: unknown }
        | null;
      const sourceContext =
        typeof json?.sourceContext === "string" && json.sourceContext.trim().length > 0
          ? json.sourceContext.trim().slice(0, 40)
          : undefined;
      const englishName =
        typeof json?.englishName === "string" && json.englishName.trim().length > 0
          ? json.englishName.trim().slice(0, 60)
          : undefined;
      return { sourceContext, englishName };
    } catch (e) {
      warnings.push(
        `[research·context-resolve] 异常：${e instanceof Error ? e.message : String(e)}`
      );
      return {};
    }
  }

  private async runNameResolutionStep(
    characterName: string,
    sourceType: CharacterCard["meta"]["sourceType"],
    hints: {
      name?: string;
      sourceName?: string;
      chineseName?: string;
      englishName?: string;
    },
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string,
    sourceContext?: string,
    identityHint?: string
  ): Promise<CharacterNamePair | null> {
    const { system, user } = buildCharacterNameResolutionPrompt({
      characterName,
      sourceType,
      sourceContext,
      identityHint,
      hints
    });
    const r = await this.llm.chatWithTools({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      temperature: 0.1,
      maxTokens: 300,
      stream: false,
      enableWebSearch: webSearchEnabled,
      maxToolCalls: 3,
      searchContextSize: "low",
      modelOverride: webSearchEnabled ? researchModel : undefined
    });
    if (r.kind === "error") {
      warnings.push(`[name·lookup] LLM 调用失败：${r.message}`);
      return null;
    }
    const json = extractJSON(r.text) as Record<string, unknown> | null;
    if (!json) {
      warnings.push("[name·lookup] LLM 未返回合法 JSON");
      return null;
    }
    const chineseName =
      typeof json.chineseName === "string" ? json.chineseName.trim() : "";
    const englishName =
      typeof json.englishName === "string" ? json.englishName.trim() : "";
    if (!chineseName || !englishName) {
      warnings.push("[name·lookup] JSON 缺少 chineseName 或 englishName");
      return null;
    }
    const confidence = typeof json.confidence === "string" ? json.confidence : "";
    if (sourceContext && confidence === "low") {
      warnings.push(
        `[name·lookup] 模型未能确认「${characterName}」在出处「${sourceContext}」内的身份（confidence=low），结果可能仍有歧义`
      );
    }
    return { chineseName, englishName };
  }

  /** 联网检索角色原话，写回 meta.quoteOneLiner + quoteStatus；外国角色确保「原文（中文译）」格式。 */
  private async finalizeCharacterQuote(
    card: CharacterCard,
    sourceType: CharacterCard["meta"]["sourceType"],
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string,
    userMaterial?: string,
    sourceContext?: string,
    identityHint?: string
  ): Promise<void> {
    const chineseName = card.meta.chineseName ?? card.meta.name;
    const englishName = card.meta.englishName ?? card.meta.sourceName ?? "";
    const pinyinEnglish = chineseNameToPinyinEnglish(chineseName);
    const chineseNative = isChineseNativeForQuote(
      chineseName,
      englishName,
      pinyinEnglish,
      sourceType
    );
    const quoteOpts = { chineseNative };

    let quote = effectiveQuoteOneLiner(card.meta.quoteOneLiner);

    if (needsQuoteLookup(quote, sourceType, quoteOpts)) {
      const resolved = await this.runQuoteResolutionStep(
        {
          chineseName,
          englishName,
          sourceType,
          sourceContext,
          identityHint,
          hintQuote: quote,
          userMaterial
        },
        webSearchEnabled,
        warnings,
        researchModel
      );
      if (resolved.ok) {
        quote = resolved.quote;
      } else {
        // 关键修复（Tatsumi bad case）：证据闸门拒绝后不能回退到旧 hintQuote——
        // hintQuote 本身就可能是提炼阶段张冠李戴产出的、格式正确但归属错误的台词。
        // 这里显式清空，宁可没有座右铭，也不展示错误归属的台词。
        warnings.push(
          `[quote·evidence] 未能核实台词归属（重试后仍不合格：${resolved.reasons.join("；")}），已清空未验证台词`
        );
        this.applyUnresolvedQuote(card, resolved.reasons);
        return;
      }
    }

    if (needsQuoteTranslation(quote, quoteOpts)) {
      const translated = await this.runQuoteTranslationStep(
        { chineseName, englishName, quoteOneLiner: quote! },
        warnings
      );
      if (translated) quote = translated;
    }

    if (!quote?.trim() || isSkeletonPlaceholderQuote(quote)) {
      this.applyUnresolvedQuote(card, ["座右铭为空或仍为骨架占位"]);
      return;
    }

    if (!isQuoteAcceptable(quote, quoteOpts)) {
      if (chineseNative) {
        warnings.push("[quote·format] 中文母语角色座右铭格式不合规，已保留原文");
      } else {
        warnings.push("[quote·format] 外国角色座右铭未能格式化为「原文（中文译）」");
      }
    }

    card.meta.quoteOneLiner = normalizeQuoteOneLiner(quote);
    card.meta.quoteStatus = "verified";
    card.meta.quoteStatusReason = undefined;
  }

  /** 原话核验失败：清空 quoteOneLiner，按人格内容写入 provisional / missing。 */
  private applyUnresolvedQuote(card: CharacterCard, reasons: string[]): void {
    card.meta.quoteOneLiner = undefined;
    card.meta.quoteStatus = deriveQuoteStatus({
      quoteOneLiner: undefined,
      signatureVocabulary: card.expressionDNA.vocabulary.signature,
      selfIntro: card.identity.selfIntro
    });
    card.meta.quoteStatusReason = reasons.join("；").slice(0, 400) || undefined;
  }

  /**
   * 台词证据闸门：最多 3 次 attempt（首次 + 两次策略换挡）。
   * 不合格则返回 ok=false，调用方必须清空台词而不是接受错误归属。
   */
  private async runQuoteResolutionStep(
    input: {
      chineseName: string;
      englishName: string;
      sourceType: CharacterCard["meta"]["sourceType"];
      sourceContext?: string;
      identityHint?: string;
      hintQuote?: string;
      userMaterial?: string;
    },
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string
  ): Promise<{ ok: true; quote: string } | { ok: false; reasons: string[] }> {
    const safeHint = effectiveQuoteOneLiner(input.hintQuote);
    const promptInput = { ...input, hintQuote: safeHint };

    const attempt = async (
      extraNote: string | undefined,
      opts: { enableWebSearch: boolean; attemptLabel: string }
    ): Promise<{
      quoteOneLiner: string;
      speaker: string;
      work: string;
      sourceUrl: string;
      citations: string[];
    } | null> => {
      const { system, user } = buildCharacterQuoteResolutionPrompt(promptInput);
      const userWithNote = extraNote ? `${user}\n\n${extraNote}` : user;
      let useWeb = opts.enableWebSearch;
      let r = await this.llm.chatWithTools({
        systemPrompt: system,
        messages: [{ role: "user", content: userWithNote }],
        temperature: 0.2,
        maxTokens: 400,
        stream: false,
        enableWebSearch: useWeb,
        maxToolCalls: 4,
        searchContextSize: "medium",
        modelOverride: useWeb ? researchModel : undefined
      });
      if (r.kind === "error" && useWeb) {
        warnings.push(
          `[quote·lookup] ${opts.attemptLabel}联网检索失败（${r.message}），回退到模型内置知识。`
        );
        useWeb = false;
        r = await this.llm.chatWithTools({
          systemPrompt: system,
          messages: [{ role: "user", content: userWithNote }],
          temperature: 0.2,
          maxTokens: 400,
          stream: false,
          enableWebSearch: false
        });
      }
      if (r.kind === "error") {
        warnings.push(`[quote·lookup] ${opts.attemptLabel}LLM 调用失败：${r.message}`);
        return null;
      }
      const json = extractJSON(r.text) as Record<string, unknown> | null;
      if (!json) {
        warnings.push(`[quote·lookup] ${opts.attemptLabel}LLM 未返回合法 JSON`);
        return null;
      }
      const quoteOneLiner =
        typeof json.quoteOneLiner === "string" ? json.quoteOneLiner.trim() : "";
      if (!quoteOneLiner) {
        warnings.push(`[quote·lookup] ${opts.attemptLabel}JSON 缺少 quoteOneLiner`);
        return null;
      }
      if (isSkeletonPlaceholderQuote(quoteOneLiner)) {
        warnings.push(
          `[quote·lookup] ${opts.attemptLabel}返回骨架占位句，已拒绝`
        );
        return null;
      }
      return {
        quoteOneLiner,
        speaker: typeof json.speaker === "string" ? json.speaker.trim() : "",
        work: typeof json.work === "string" ? json.work.trim() : "",
        sourceUrl: typeof json.sourceUrl === "string" ? json.sourceUrl.trim() : "",
        citations: r.citations
      };
    };

    const evaluate = (
      candidate: NonNullable<Awaited<ReturnType<typeof attempt>>>
    ) =>
      checkQuoteEvidence({
        candidate,
        chineseName: input.chineseName,
        englishName: input.englishName,
        sourceContext: input.sourceContext,
        citations: candidate.citations,
        sourceType: input.sourceType
      });

    const PLACEHOLDER_BAN =
      "禁止输出「我还没准备好」或 I'm not ready yet 等占位句；找不到可核验原话时 quoteOneLiner 必须返回空字符串。";

    // Attempt 1：联网（若开启）正常检索
    warnings.push("[quote·lookup] 正在核实代表性原话…（1/3）");
    const first = await attempt(PLACEHOLDER_BAN, {
      enableWebSearch: webSearchEnabled,
      attemptLabel: "第1次"
    });
    if (first) {
      const firstCheck = evaluate(first);
      if (firstCheck.ok) {
        return { ok: true, quote: normalizeQuoteOneLiner(first.quoteOneLiner) };
      }
      warnings.push(
        `[quote·evidence] 第1次未通过证据核验（${firstCheck.reasons.join("；")}），换检索策略重试`
      );

      // Attempt 2：喂失败原因，要求换出处 / 检索词
      warnings.push("[quote·lookup] 正在核实代表性原话…（2/3）");
      const retryNote =
        `上一次的结果把台词归属为 speaker="${first.speaker}" / work="${first.work}"，但核验失败：${firstCheck.reasons.join("；")}。` +
        "请更换检索词与出处来源后重新检索，确保说话人和出处与目标角色完全一致。" +
        PLACEHOLDER_BAN;
      const second = await attempt(retryNote, {
        enableWebSearch: webSearchEnabled,
        attemptLabel: "第2次"
      });
      if (second) {
        const secondCheck = evaluate(second);
        if (secondCheck.ok) {
          return { ok: true, quote: normalizeQuoteOneLiner(second.quoteOneLiner) };
        }
        warnings.push(
          `[quote·evidence] 第2次未通过证据核验（${secondCheck.reasons.join("；")}），最后一轮换挡`
        );

        // Attempt 3：策略换挡——有联网则强制内置知识；无联网则收紧为短句约束
        warnings.push("[quote·lookup] 正在核实代表性原话…（3/3）");
        const thirdNote = webSearchEnabled
          ? "本轮请仅使用你已有的可靠知识，给出一句可核验的短原话，并填写准确的 speaker / work。" +
            PLACEHOLDER_BAN
          : "请只返回一句不超过 40 字、可核验的短原话，并填写 speaker；不确定就留空。" +
            PLACEHOLDER_BAN;
        const third = await attempt(thirdNote, {
          enableWebSearch: false,
          attemptLabel: "第3次"
        });
        if (third) {
          const thirdCheck = evaluate(third);
          if (thirdCheck.ok) {
            return { ok: true, quote: normalizeQuoteOneLiner(third.quoteOneLiner) };
          }
          return { ok: false, reasons: thirdCheck.reasons };
        }
        return { ok: false, reasons: secondCheck.reasons };
      }
      return { ok: false, reasons: firstCheck.reasons };
    }

    // 首次 LLM 无结果：仍尝试第 2、3 轮
    warnings.push("[quote·lookup] 第1次未产出结果，继续重试（2/3）");
    const second = await attempt(
      "上一次未能产出可用 JSON。请重新检索并严格返回指定字段。" + PLACEHOLDER_BAN,
      { enableWebSearch: webSearchEnabled, attemptLabel: "第2次" }
    );
    if (second) {
      const secondCheck = evaluate(second);
      if (secondCheck.ok) {
        return { ok: true, quote: normalizeQuoteOneLiner(second.quoteOneLiner) };
      }
      warnings.push(
        `[quote·evidence] 第2次未通过（${secondCheck.reasons.join("；")}），最后一轮（3/3）`
      );
      const third = await attempt(
        "请换一种出处再试；找不到则 quoteOneLiner 留空。" + PLACEHOLDER_BAN,
        { enableWebSearch: false, attemptLabel: "第3次" }
      );
      if (third) {
        const thirdCheck = evaluate(third);
        if (thirdCheck.ok) {
          return { ok: true, quote: normalizeQuoteOneLiner(third.quoteOneLiner) };
        }
        return { ok: false, reasons: thirdCheck.reasons };
      }
      return { ok: false, reasons: secondCheck.reasons };
    }

    warnings.push("[quote·lookup] 第2次仍无结果，最后一轮（3/3）");
    const third = await attempt(
      "最后一次尝试：给出一句短原话或留空。" + PLACEHOLDER_BAN,
      { enableWebSearch: false, attemptLabel: "第3次" }
    );
    if (!third) return { ok: false, reasons: ["LLM 未产出可用结果"] };
    const thirdCheck = evaluate(third);
    if (thirdCheck.ok) {
      return { ok: true, quote: normalizeQuoteOneLiner(third.quoteOneLiner) };
    }
    return { ok: false, reasons: thirdCheck.reasons };
  }

  /** 为缺少中文译文的外文座右铭补译。 */
  private async runQuoteTranslationStep(
    input: { chineseName: string; englishName: string; quoteOneLiner: string },
    warnings: string[]
  ): Promise<string | null> {
    const { system, user } = buildCharacterQuoteTranslationPrompt(input);
    const r = await this.llm.chatOnce({
      systemPrompt: system,
      messages: [{ role: "user", content: user }],
      temperature: 0.2,
      maxTokens: 300,
      stream: false
    });
    if (r.kind === "error") {
      warnings.push(`[quote·translate] LLM 调用失败：${r.message}`);
      return null;
    }
    const json = extractJSON(r.text) as Record<string, unknown> | null;
    if (!json) {
      warnings.push("[quote·translate] LLM 未返回合法 JSON");
      return null;
    }
    const quoteOneLiner =
      typeof json.quoteOneLiner === "string" ? json.quoteOneLiner.trim() : "";
    if (!quoteOneLiner) {
      warnings.push("[quote·translate] JSON 缺少 quoteOneLiner");
      return null;
    }
    return normalizeQuoteOneLiner(quoteOneLiner);
  }

  /** 非原创角色的外貌是否可信度不足：通用模板兜底 / 性别未知都算「关键失败」。 */
  private isAppearanceLowConfidence(
    spec: AppearanceSpec | null,
    sourceType: "public-figure" | "fictional" | "original"
  ): boolean {
    if (!spec) return true;
    if (sourceType === "original") return false;
    if (spec.sourceConfidence === "low") return true;
    if (spec.gender === "unknown") return true;
    return false;
  }

  /**
   * 外貌可信度闸门：非原创角色若首次结果是 low confidence / gender=unknown，
   * 按「成本优先」策略自动重试一次（把「可信度不足」原因喂回 userHint）；
   * 重试仍不达标时不再静默交付通用模板——显式在 citationNotes 标注，
   * 提示用户上传参考图或重新生成形象，而不是假装成功。
   */
  private async resolveAppearanceWithEvidenceGate(
    input: Parameters<BailinOrchestrator["runAppearanceDeep"]>[0],
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel: string | undefined,
    sourceType: "public-figure" | "fictional" | "original"
  ): Promise<AppearanceSpec | null> {
    const first = await this.runAppearanceDeep(input, webSearchEnabled, warnings, researchModel);
    if (!this.isAppearanceLowConfidence(first, sourceType)) {
      return first;
    }

    warnings.push(
      `[phase3b·evidence] 外貌可信度不足（${
        first ? `sourceConfidence=${first.sourceConfidence}, gender=${first.gender}` : "生成失败"
      }），正在自动重试一次`
    );
    const retryHint = [
      input.userHint,
      "上一次结果外貌可信度不足（可能套了通用模板或性别未知），请更仔细核实官方形象细节，给出具体的发型/瞳色/服装/标志性配饰。"
    ]
      .filter((s): s is string => !!s && s.trim().length > 0)
      .join("\n");
    const retried = await this.runAppearanceDeep(
      { ...input, userHint: retryHint },
      webSearchEnabled,
      warnings,
      researchModel
    );
    if (!this.isAppearanceLowConfidence(retried, sourceType)) {
      return retried;
    }

    const finalSpec = retried ?? first;
    if (!finalSpec) return null;
    warnings.push(
      "[phase3b·evidence] 自动重试后外貌可信度仍不足，已交付但已标注；建议上传参考图后点「重新生成形象」以修正。"
    );
    return {
      ...finalSpec,
      citationNotes: [
        ...(finalSpec.citationNotes ?? []),
        "⚠ 外貌可信度低：调研未能确认官方细节，建议补充参考图后重新生成形象"
      ]
    };
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
      sourceContext?: string;
      identityHint?: string;
      referenceImages: ReferenceImageInput[];
      onStatusMessage?: (message: string) => void;
    },
    webSearchEnabled: boolean,
    warnings: string[],
    researchModel?: string
  ): Promise<AppearanceSpec | null> {
    const vis = this.llm.detectVisionCapability();
    const notify = input.onStatusMessage;

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
      notify?.(APPEARANCE_PHASE_FALLBACK_VISION_FAILED);
      warnings.push(
        "[phase3b·vision] vision 路径未能产出合法 spec，降级到纯文本三步法"
      );
    } else if (!vis.vision) {
      notify?.(APPEARANCE_PHASE_FALLBACK_NO_VISION);
      warnings.push(
        `[phase3b·vision] 视觉模型不可用（${vis.reason}），降级到纯文本三步法；结果可能偏离原作。`
      );
    } else {
      notify?.(APPEARANCE_PHASE_FALLBACK_NO_IMAGES);
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
        sourceContext: input.sourceContext,
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
      sourceContext?: string;
      identityHint?: string;
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
      "5. 最多 3 个；若一个都没找到，返回 { \"images\": [] }。",
      "6. 若给出了出处 / 身份锚点，搜图关键词必须带上它，确保搜到的是同一出处内的角色，不是同名其它角色/其它作品。"
    ].join("\n");
    const userParts = [
      `角色：「${input.characterName}」${input.sourceName ? `（${input.sourceName}）` : ""}`,
      `类型：${input.sourceType}`
    ];
    if (input.sourceContext) {
      userParts.push(`出处 / 身份锚点：${input.sourceContext}（搜图必须锁定此出处内的角色）`);
    }
    if (input.identityHint) {
      userParts.push(`身份定位提示：${input.identityHint}`);
    }
    userParts.push("搜图，输出 JSON。");
    const user = userParts.join("\n");

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
      sourceContext?: string;
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
      sourceContext: input.sourceContext,
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
      stream: false,
      modelOverride: this.llm.getVisionModel()
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
      sourceContext: input.sourceContext,
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
        stream: false,
        modelOverride: this.llm.getVisionModel()
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
      sourceContext?: string;
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
    const visual = await this.runVisualStep(
      input.card.id,
      input.card.meta.name,
      input.card.meta.sourceType,
      appearance,
      refs,
      warnings
    );
    if (!visual.sprite) {
      return { ok: false, appearance, error: "sprite 生成失败", warnings };
    }
    return { ok: true, appearance, sprite: visual.sprite, warnings };
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
      return `联网通道暂时不可用：${toUserFacingProviderError(result.message)}`;
    }
    const usedTool = result.toolEvents.some((e) => e.kind === "tool_start");
    if (!usedTool || result.citations.length === 0) {
      // 不阻断流程。部分中转会吞掉 annotations，但仍可能返回有用文本。
      // 后续 research 阶段会通过 webSearchUsed=false / sources=0 降低可信度提示。
      return null;
    }
    return null;
  }

  /**
   * 视觉步骤：默认走 hatch-pet 主路径（如果已装配 ImageGenerationAdapter），
   * 失败或未就绪时返回 null，让调用方显性报错 / 使用骨架，不再回退到 CSS 分层。
   *
   * @param characterId 当前角色 id；hatch-pet 需要它来把 atlas / QA 资产落到 vault/characters/<id>/pet/
   * @param onHatchProgress 可选；当 orchestrator 处于深度蒸馏流程时，可借此把 hatch 事件转发到 UI
   */
  private async runVisualStep(
    characterId: string,
    characterName: string,
    _sourceType: "public-figure" | "fictional" | "original",
    appearance: AppearanceSpec,
    referenceImages: ReferenceImageInput[],
    warnings: string[],
    onHatchProgress?: (evt: HatchProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<{
    sprite: SpriteProgram | null;
    failedRows: HatchPetRowState[];
    totalCostUsd: number;
    failedRowReasons: Partial<Record<HatchPetRowState, string>>;
  }> {
    const emptyVisual = {
      sprite: null as SpriteProgram | null,
      failedRows: [] as HatchPetRowState[],
      totalCostUsd: 0,
      failedRowReasons: {} as Partial<Record<HatchPetRowState, string>>
    };
    if (signal?.aborted) {
      return emptyVisual;
    }
    if (this.hatchPipeline) {
      try {
        const result = await this.hatchPipeline.run({
          characterId,
          characterName,
          appearance,
          userReferences: referenceImages,
          onProgress: onHatchProgress,
          signal
        });
        if (signal?.aborted) {
          return emptyVisual;
        }
        for (const w of result.warnings) warnings.push(`[step3·hatch] ${w}`);
        if (result.program) {
          const parsed = parseSprite(result.program);
          if (parsed.ok && parsed.data) {
            return {
              sprite: parsed.data,
              failedRows: result.failedRows,
              totalCostUsd: result.totalCostUsd,
              failedRowReasons: result.failedRowReasons
            };
          }
          warnings.push(
            `[step3·hatch] 生成的 atlas 未通过 schema：${(parsed.errors ?? [])
              .map((e) => `${e.path}=${e.message}`)
              .slice(0, 3)
              .join(" | ")}`
          );
        } else if (result.errors.length > 0) {
          warnings.push(`[step3·hatch] 失败：${result.errors.join(" | ")}`);
        }
      } catch (e) {
        if (signal?.aborted) {
          return emptyVisual;
        }
        warnings.push(
          `[step3·hatch] 异常：${e instanceof Error ? e.message : String(e)}`
        );
      }
    } else {
      warnings.push("[step3·hatch] 生图 pipeline 未初始化：缺少 ImageGenerationAdapter 或 Vault");
    }
    if (signal?.aborted) {
      return emptyVisual;
    }
    try {
      const fallback = buildSpriteFromAppearance(appearance);
      const parsed = parseSprite(fallback);
      if (parsed.ok && parsed.data) {
        warnings.push(
          "图像生成暂时没有完成，已先生成一只程序化像素形象；之后可在角色仓库点「重画形象」。"
        );
        return { ...emptyVisual, sprite: parsed.data };
      }
      warnings.push("[step3·programmatic] 程序化像素形象未通过 schema");
    } catch (e) {
      warnings.push(
        `[step3·programmatic] 程序化像素形象失败：${e instanceof Error ? e.message : String(e)}`
      );
    }
    return emptyVisual;
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

function buildResearchSummaryPayload(
  docs: ResearchDoc[],
  totalDurationMs: number,
  okCount: number,
  failedCount: number,
  materialModeUsed: "web" | "local-first" | "local-only" = "web"
): ResearchSummaryPayload {
  return {
    docs: docs.map((d) => ({
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
    okCount,
    failedCount,
    totalDurationMs,
    materialModeUsed,
    review: mergeResearchSummary(docs, materialModeUsed)
  };
}

function phaseEvent(
  jobId: string,
  phase: DistillationJob["status"],
  progress: number,
  message: string
): DeepProgressEvent {
  return { kind: "phase", jobId, phase, progress, message };
}

function toUserFacingProviderError(raw: string): string {
  const text = raw.trim();
  if (/401|403|unauthorized|invalid api key|AUTH_FAILED/i.test(text)) {
    return "API Key 无效或没有权限，请在「模型与 API Key」里重新保存并测试。";
  }
  if (/429|rate limit|RATE_LIMITED/i.test(text)) {
    return "模型供应商限流了。请稍等后重试，或降低并发 / 换一个供应商。";
  }
  if (/abort|timeout|timed out/i.test(text)) {
    return "模型响应超时。请稍后重试，或换一个更稳定的供应商。";
  }
  if (/search-preview|web_search|annotations|citation|url_citation|web_search_options|baseUrl/i.test(text)) {
    return "联网来源验证没有通过。系统可以继续深度创建，但调研可信度会偏低。";
  }
  return text.slice(0, 180);
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

function toHatchDTO(evt: HatchProgressEvent): HatchProgressEventDTO {
  switch (evt.kind) {
    case "atlas_composed":
      return {
        kind: "atlas_composed",
        ok: evt.report.ok,
        issuesCount: evt.report.issues.length,
        issuesPreview: evt.report.issues.slice(0, 4)
      };
    default:
      // 其余事件结构一致，直接强转
      return evt as unknown as HatchProgressEventDTO;
  }
}

/**
 * 当深度外貌管道失败、用户也没传参考图、联网搜图也没找到可用图时的最小默认 AppearanceSpec。
 * 关键作用：保证 hatch-pet 一定有 spec 可吃，gpt-image-2 一定会被尝试调用——
 * 用户至少能拿到一只"AI 画的桌宠"而不是骨架占位。
 *
 * 颜色按 track 走和 makeSkeletonSprite 相同的两套调色板，保持视觉一致。
 */
function makeMinimalAppearance(
  characterName: string,
  sourceType: "public-figure" | "fictional" | "original",
  track: "utility" | "companion"
): AppearanceSpec {
  const palette =
    track === "utility"
      ? [
          { role: "outline" as const, hex: "#1f2933" },
          { role: "skin" as const, hex: "#f3d3b1" },
          { role: "shirt" as const, hex: "#1a3a3a" },
          { role: "accent" as const, hex: "#d94f70" },
          { role: "hair" as const, hex: "#3d2c1a" },
          { role: "eye" as const, hex: "#3d2c1a" }
        ]
      : [
          { role: "outline" as const, hex: "#2b2233" },
          { role: "skin" as const, hex: "#f8d3c5" },
          { role: "shirt" as const, hex: "#9b7bd4" },
          { role: "accent" as const, hex: "#ffd166" },
          { role: "hair" as const, hex: "#5a3e2a" },
          { role: "eye" as const, hex: "#5a3e2a" }
        ];
  return {
    schemaVersion: "0.1",
    build: "average",
    ageBand: "young-adult",
    gender: "unknown",
    animeStyle: "chibi",
    faceShape: "圆润",
    skinTone: { name: "skin", hex: palette[1]!.hex },
    hair: { style: "短发", color: { name: "hair", hex: palette[4]!.hex } },
    eyes: {
      color: { name: "eye", hex: palette[5]!.hex },
      shape: "圆眼",
      expression: track === "utility" ? "专注" : "温柔"
    },
    facialFeatures: [],
    outfit: {
      iconic: false,
      top: {
        name: track === "utility" ? "深色立领" : "柔色毛衣",
        color: { name: "shirt", hex: palette[2]!.hex },
        details: []
      },
      accessories: []
    },
    gear: [],
    palette,
    styleTokens: ["chibi", "friendly", "minimal"],
    typicalScene: "",
    sourceConfidence: "low",
    citationNotes: [
      `${characterName}（${sourceType}）·最小默认外貌：调研未能拿到可信视觉信息，已用通用 chibi 模板`
    ],
    referenceImages: []
  };
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

