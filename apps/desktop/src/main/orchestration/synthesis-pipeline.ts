/**
 * Phase 2 框架提炼流水线：把调研文档压成内存中的 `CharacterCard`。
 *
 * 主路径是两阶段合成（Pass A 扫描候选 → Pass B 出完整卡）；Pass A 失败则回退单次提炼。
 * 另含定向重提炼补丁、质量薄弱标注、answerProtocol 补全。本文件不落盘、不写角色包。
 */
import type { CharacterCard, QualityReport, ResearchDoc } from "@bailin/character-protocol";
import {
  buildFrameworkSynthesisPrompt,
  buildSynthesisPassAPrompt,
  buildSynthesisPassBPrompt,
  buildTargetedResynthesisPrompt,
  buildAnswerProtocolGenerationPrompt,
  deriveFallbackAnswerProtocol,
  parseAnswerProtocolFromLLM,
  type FrameworkSynthesisInput,
  type SynthesisPassAResult
} from "@bailin/prompts";
import type { DistillationJobConfig } from "@bailin/character-protocol";
import { isAnswerProtocolValid, parseCard, SCHEMA_VERSION } from "@bailin/character-protocol";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

/** 质量自检闭环里定向重提炼的最大轮数（含首次合成后的补强）。 */
export const MAX_SYNTHESIS_ROUNDS = 2;
/** 质量总分低于此阈值时触发定向重提炼（与 Sanity/Edge 失败条件并列）。 */
export const RESYNTHESIS_SCORE_THRESHOLD = 0.65;
/** Phase 1 调研成功但 Phase 2 提炼失败时的自动重试上限（含首次）。 */
export const MAX_PHASE2_ATTEMPTS = 3;
/** 至少几路调研成功才值得为心智模型自动重试提炼（避免调研本身崩了还空转）。 */
export const PHASE2_RETRY_MIN_OK_DOCS = 3;

/**
 * 两阶段提炼的产出。
 * `card` 为 null 表示本轮未得到合法人格卡；
 * `passA` 为 null 表示走了单次回退路径或 Pass A 未成功。
 */
export interface TwoPhaseSynthesisResult {
  card: CharacterCard | null;
  passA: SynthesisPassAResult | null;
}

/**
 * Phase 1 已产出足够调研、但 Phase 2 未产出合法人格卡时，应自动重试提炼，
 * 避免「调研档案齐全、心智模型却是骨架占位」直接交付。
 *
 * @param docs 调研文档；只计 `status === "ok"` 的路数
 * @param card 当前人格卡；非 null 则不必重试
 * @returns 是否应再跑一轮提炼；无副作用
 */
export function shouldRetryPhase2Synthesis(
  docs: ResearchDoc[],
  card: CharacterCard | null
): boolean {
  if (card != null) return false;
  const okCount = docs.filter((d) => d.status === "ok").length;
  return okCount >= PHASE2_RETRY_MIN_OK_DOCS;
}

/**
 * 定向重提炼补丁：覆盖心智模型与启发式，可选追加诚实边界备注与价值观张力。
 * 由 `applyResynthesisPatch` 写回原卡；本结构本身不含副作用。
 */
export interface TargetedResynthesisPatch {
  mentalModels: CharacterCard["mentalModels"];
  heuristics: CharacterCard["heuristics"];
  honestyNotesAppend?: string[];
  tensionsAppend?: string[];
}

/**
 * 两阶段提炼：Pass A 扫描候选 → Pass B 生成完整 card。
 * Pass A 失败时回退单次提炼；不抛错，失败只写入 `warnings`。
 *
 * @param llm 聊天适配器；本函数会多次 `chatOnce`（非流式、thinking 关闭）
 * @param config 蒸馏任务配置（角色名 / 来源 / 赛道 / 用户素材）
 * @param docs Phase 1 调研文档；失败路会以错误摘要进入 prompt
 * @param warnings 就地追加告警，调用方负责展示
 * @param opts.attempt 第几次尝试（≥2 抬 token、降温并压缩调研正文）
 * @returns `{ card, passA }`；card 可能为 null
 */
export async function runTwoPhaseSynthesis(
  llm: LLMAdapter,
  config: DistillationJobConfig,
  docs: ResearchDoc[],
  warnings: string[],
  opts?: { attempt?: number }
): Promise<TwoPhaseSynthesisResult> {
  const attempt = opts?.attempt ?? 1;
  // 重试时抬高 token、略降温，专门对抗截断 / 结构漂移。
  const passAMaxTokens = attempt >= 2 ? 6000 : 4500;
  const passBMaxTokens = attempt >= 2 ? 8000 : 5500;
  const legacyMaxTokens = attempt >= 2 ? 7000 : 5000;
  const temperature = attempt >= 3 ? 0.2 : attempt >= 2 ? 0.35 : 0.3;
  // DeepSeek V4 默认 thinking 会吃光 max_tokens → content 为空；提炼必须关掉。
  const thinking = "disabled" as const;
  // 重试时压缩调研正文，降低 prompt 体积，给正文输出留预算
  const markdownCap = attempt >= 3 ? 900 : attempt >= 2 ? 1400 : undefined;

  const input = toSynthesisInput(config, docs, markdownCap);
  const passA = await runPassA(llm, input, warnings, {
    maxTokens: passAMaxTokens,
    thinking
  });
  if (!passA) {
    warnings.push("[phase2·passA] 扫描失败，回退单次提炼");
    const card = await runLegacySinglePassSynthesis(llm, input, warnings, {
      maxTokens: legacyMaxTokens,
      temperature,
      thinking
    });
    if (card) {
      await ensureAnswerProtocol(llm, card, warnings);
    }
    return { card, passA: null };
  }

  const card = await runPassB(llm, input, passA, warnings, {
    maxTokens: passBMaxTokens,
    temperature,
    thinking
  });
  if (card) {
    await ensureAnswerProtocol(llm, card, warnings);
  }
  return { card, passA };
}

/**
 * 带调研成功守卫的 Phase 2：首次失败且调研足够完整时自动重试，
 * 避免直接落到骨架心智模型。
 *
 * @param llm 聊天适配器
 * @param config 蒸馏任务配置
 * @param docs Phase 1 调研文档（用 `shouldRetryPhase2Synthesis` 判断是否值得重试）
 * @param warnings 汇总各次尝试的告警（重试轮会加 `[phase2·attempt n/m]` 前缀）
 * @param opts.maxAttempts 覆盖默认 `MAX_PHASE2_ATTEMPTS`
 * @param opts.onAttempt 每轮开始前回调，仅通知 UI，不改变结果
 * @returns 最后一轮的 `{ card, passA }`；全部失败时 card 为 null
 */
export async function runPhase2SynthesisWithResearchGuard(
  llm: LLMAdapter,
  config: DistillationJobConfig,
  docs: ResearchDoc[],
  warnings: string[],
  opts?: {
    maxAttempts?: number;
    onAttempt?: (attempt: number, maxAttempts: number) => void | Promise<void>;
  }
): Promise<TwoPhaseSynthesisResult> {
  const maxAttempts = opts?.maxAttempts ?? MAX_PHASE2_ATTEMPTS;
  let last: TwoPhaseSynthesisResult = { card: null, passA: null };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await opts?.onAttempt?.(attempt, maxAttempts);
    const attemptWarnings: string[] = [];
    last = await runTwoPhaseSynthesis(llm, config, docs, attemptWarnings, { attempt });
    const prefix = attempt === 1 ? "" : `[phase2·attempt ${attempt}/${maxAttempts}] `;
    for (const w of attemptWarnings) {
      warnings.push(`${prefix}${w}`);
    }

    if (last.card) {
      if (attempt > 1) {
        warnings.push(`[phase2·retry] 第 ${attempt} 次框架提炼成功（调研已保全）`);
      }
      return last;
    }

    if (!shouldRetryPhase2Synthesis(docs, null) || attempt >= maxAttempts) {
      break;
    }
    const okCount = docs.filter((d) => d.status === "ok").length;
    warnings.push(
      `[phase2·retry] 第 ${attempt} 次框架提炼失败；调研已成功 ${okCount} 路，自动重试以避免骨架心智模型`
    );
  }

  if (!last.card) {
    warnings.push(
      `[phase2·synthesis] ${Math.min(maxAttempts, MAX_PHASE2_ATTEMPTS)} 次框架提炼均失败，将回退到骨架角色`
    );
  }
  return last;
}

/**
 * 针对质量未过关的心智模型 / 启发式做定向重提炼，返回补丁而不改原卡。
 *
 * LLM 失败、JSON 非法或 `parseCard` 校验失败时返回 null，并写入 `warnings`。
 * 不修改传入的 `card`；由调用方再 `applyResynthesisPatch`。
 *
 * @param llm 聊天适配器（非流式、thinking 关闭、温度 0.25）
 * @param config 蒸馏任务配置，用于 prompt 角色锚点
 * @param docs 调研文档；失败路以 `> Agent … 失败` 占位
 * @param card 当前人格卡，只作 prompt 输入
 * @param qualityReport Phase 4 质量报告，指出薄弱项
 * @param passA 可选的 Pass A 扫描结果，帮助模型对照候选
 * @param warnings 就地追加失败原因
 * @returns 校验通过的补丁；失败为 null
 */
export async function runTargetedResynthesis(
  llm: LLMAdapter,
  config: DistillationJobConfig,
  docs: ResearchDoc[],
  card: CharacterCard,
  qualityReport: QualityReport,
  passA: SynthesisPassAResult | null,
  warnings: string[]
): Promise<TargetedResynthesisPatch | null> {
  const segments = docs.map((d) => ({
    agentId: d.agentId,
    agentName: d.agentName,
    markdown: d.status === "ok" ? d.markdown : `> Agent ${d.agentId} 失败`,
    confidence: d.confidence
  }));

  const { system, user } = buildTargetedResynthesisPrompt({
    characterName: config.characterName,
    sourceType: config.sourceType,
    track: config.track,
    currentCard: {
      mentalModels: card.mentalModels,
      heuristics: card.heuristics,
      expressionDNA: card.expressionDNA,
      values: card.values,
      honestyBoundary: card.honestyBoundary
    },
    qualityReport,
    researchSegments: segments,
    passA: passA ?? undefined,
    userMaterial: config.userMaterial
  });

  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.25,
    maxTokens: 4000,
    stream: false,
    thinking: "disabled"
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·retry] 定向重提炼失败：${r.message}`);
    return null;
  }

  const json = extractJSON(r.text) as Record<string, unknown> | null;
  if (!json) {
    warnings.push("[phase2·retry] 未返回合法 JSON");
    return null;
  }

  const probe = {
    ...card,
    mentalModels: json.mentalModels ?? card.mentalModels,
    heuristics: json.heuristics ?? card.heuristics
  };
  const parsed = parseCard({
    ...probe,
    id: card.id,
    schemaVersion: SCHEMA_VERSION,
    createdAt: card.createdAt,
    updatedAt: Date.now()
  });
  if (!parsed.ok || !parsed.data) {
    warnings.push("[phase2·retry] mentalModels/heuristics 校验失败");
    return null;
  }

  return {
    mentalModels: parsed.data.mentalModels,
    heuristics: parsed.data.heuristics,
    honestyNotesAppend: Array.isArray(json.honestyNotesAppend)
      ? (json.honestyNotesAppend as string[]).filter((s) => typeof s === "string")
      : undefined,
    tensionsAppend: Array.isArray(json.tensionsAppend)
      ? (json.tensionsAppend as string[]).filter((s) => typeof s === "string")
      : undefined
  };
}

/**
 * 是否应触发定向重提炼：总分过低、总评 fail，或 Sanity/Edge 未过。
 *
 * @param report Phase 4 质量报告
 * @returns true 表示应调用 `runTargetedResynthesis`；无副作用
 */
export function shouldTriggerResynthesis(report: QualityReport): boolean {
  if (report.overallScore < RESYNTHESIS_SCORE_THRESHOLD) return true;
  if (report.verdict === "fail") return true;
  if (report.sanityTest && !report.sanityTest.overallPass) return true;
  if (report.edgeTest && !report.edgeTest.pass) return true;
  return false;
}

/**
 * 达上限仍不通过时，把未过关维度写入诚实边界备注（就地修改 `card`）。
 * 备注去重后最多保留 8 条。
 *
 * @param card 被标注的人格卡
 * @param report 最后一轮质量报告
 * @param synthesisRounds 已完成的提炼轮次，写入文案
 */
export function annotateQualityWeaknesses(
  card: CharacterCard,
  report: QualityReport,
  synthesisRounds: number
): void {
  const failed = report.items.filter((i) => !i.pass).map((i) => i.label);
  const notes = [...(card.honestyBoundary.notes ?? [])];
  notes.push(
    `质量自检在第 ${synthesisRounds} 轮提炼后仍有未通过项：${failed.slice(0, 5).join("、")}。`
  );
  if (report.sanityTest && !report.sanityTest.overallPass) {
    notes.push("公开立场一致性（Sanity）未完全达标，对已知话题的回答可能偏泛。");
  }
  if (report.edgeTest && !report.edgeTest.pass) {
    notes.push("对未公开讨论话题可能过于断言，使用时请自行判断。");
  }
  card.honestyBoundary = {
    ...card.honestyBoundary,
    notes: [...new Set(notes)].slice(0, 8)
  };
}

/**
 * 把定向重提炼补丁写回人格卡（就地修改）。
 *
 * 覆盖 mentalModels / heuristics，刷新 `updatedAt`，并清空 `answerProtocol`
 * （心智模型变了，旧路由可能不匹配，需后续 `ensureAnswerProtocol` 重生）。
 * 可选把诚实边界备注、价值观张力去重追加。
 *
 * @param card 被修改的人格卡
 * @param patch `runTargetedResynthesis` 的产出
 */
export function applyResynthesisPatch(
  card: CharacterCard,
  patch: TargetedResynthesisPatch
): void {
  card.mentalModels = patch.mentalModels;
  card.heuristics = patch.heuristics;
  card.updatedAt = Date.now();
  // 心智模型变更后，旧路由可能不匹配，清除以触发重新生成
  card.answerProtocol = undefined;
  if (patch.honestyNotesAppend?.length) {
    card.honestyBoundary = {
      ...card.honestyBoundary,
      notes: [...new Set([...(card.honestyBoundary.notes ?? []), ...patch.honestyNotesAppend])]
    };
  }
  if (patch.tensionsAppend?.length) {
    card.values = {
      ...card.values,
      tensions: [...new Set([...(card.values.tensions ?? []), ...patch.tensionsAppend])]
    };
  }
}

/** Pass A：从调研中扫描心智模型/启发式候选。失败返回 null，由调用方回退单次提炼。 */
async function runPassA(
  llm: LLMAdapter,
  input: FrameworkSynthesisInput,
  warnings: string[],
  opts?: { maxTokens?: number; thinking?: "enabled" | "disabled" }
): Promise<SynthesisPassAResult | null> {
  const { system, user } = buildSynthesisPassAPrompt(input);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.25,
    maxTokens: opts?.maxTokens ?? 4500,
    stream: false,
    thinking: opts?.thinking
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·passA] LLM 失败：${r.message}`);
    return null;
  }
  if (r.finishReason === "length") {
    // Pass A 截断仍尝试解析已有 JSON；Pass B / legacy 则直接失败以便外层重试。
    warnings.push("[phase2·passA] 输出被截断（finish_reason=length）");
  }
  const json = extractJSON(r.text) as Record<string, unknown> | null;
  if (!json || !Array.isArray(json.candidates)) {
    warnings.push("[phase2·passA] JSON 结构无效");
    return null;
  }
  const candidates = (json.candidates as unknown[])
    .filter((c): c is Record<string, unknown> => c != null && typeof c === "object")
    .slice(0, 30)
    .map((c, i) => ({
      id: typeof c.id === "string" ? c.id : `c${i + 1}`,
      claim: typeof c.claim === "string" ? c.claim.slice(0, 240) : "",
      domains: Array.isArray(c.domains) ? (c.domains as string[]).slice(0, 5) : [],
      evidenceRefs: Array.isArray(c.evidenceRefs)
        ? (c.evidenceRefs as string[]).slice(0, 4)
        : [],
      initialTier: normalizeTier(c.initialTier)
    }))
    .filter((c) => c.claim.length > 0);

  if (candidates.length < 5) {
    warnings.push(`[phase2·passA] 候选过少（${candidates.length}），Pass B 可能质量不足`);
  }

  return {
    candidates,
    contradictions: stringArray(json.contradictions),
    sourceGaps: stringArray(json.sourceGaps)
  };
}

/** Pass B：基于 Pass A 候选生成完整 CharacterCard。截断视为失败，便于外层重试。 */
async function runPassB(
  llm: LLMAdapter,
  input: FrameworkSynthesisInput,
  passA: SynthesisPassAResult,
  warnings: string[],
  opts?: { maxTokens?: number; temperature?: number; thinking?: "enabled" | "disabled" }
): Promise<CharacterCard | null> {
  const { system, user } = buildSynthesisPassBPrompt(input, passA);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: opts?.temperature ?? 0.3,
    maxTokens: opts?.maxTokens ?? 5500,
    stream: false,
    thinking: opts?.thinking
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·passB] LLM 失败：${r.message}`);
    return null;
  }
  if (r.finishReason === "length") {
    warnings.push("[phase2·passB] 输出被截断（finish_reason=length），本轮视为失败以便重试");
    return null;
  }
  return parseCardFromLLM(r.text, warnings, "[phase2·passB]", input);
}

/** 单次框架提炼回退路径（Pass A 失败时使用）。截断同样视为失败。 */
async function runLegacySinglePassSynthesis(
  llm: LLMAdapter,
  input: FrameworkSynthesisInput,
  warnings: string[],
  opts?: { maxTokens?: number; temperature?: number; thinking?: "enabled" | "disabled" }
): Promise<CharacterCard | null> {
  const { system, user } = buildFrameworkSynthesisPrompt(input);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: opts?.temperature ?? 0.3,
    maxTokens: opts?.maxTokens ?? 5000,
    stream: false,
    thinking: opts?.thinking
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·legacy] LLM 失败：${r.message}`);
    return null;
  }
  if (r.finishReason === "length") {
    warnings.push("[phase2·legacy] 输出被截断（finish_reason=length），本轮视为失败以便重试");
    return null;
  }
  return parseCardFromLLM(r.text, warnings, "[phase2·legacy]", input);
}

/** 从 LLM 正文抽出 JSON，补齐必填字段后经 `parseCard` 校验；失败只记 warning。 */
function parseCardFromLLM(
  text: string,
  warnings: string[],
  label: string,
  input: FrameworkSynthesisInput
): CharacterCard | null {
  const json = extractJSON(text) as Record<string, unknown> | null;
  if (!json) {
    warnings.push(`${label} 未返回合法 JSON`);
    return null;
  }
  ensureTimelineAndSources(json, warnings, label);
  seedRequiredCardFields(json, input, warnings, label);
  normalizeMentalModelsAndHeuristics(json, warnings, label);
  const seeded = {
    ...json,
    id: "temp",
    schemaVersion: SCHEMA_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const parsed = parseCard(seeded);
  if (parsed.ok && parsed.data) return parsed.data;
  warnings.push(
    `${label} 校验失败：${(parsed.errors ?? []).map((e) => e.path).slice(0, 6).join(", ")}`
  );
  return null;
}

/** 缺 timeline/sources 时注入占位，避免整卡因非核心字段作废。 */
function ensureTimelineAndSources(
  json: Record<string, unknown>,
  warnings: string[],
  label: string
): void {
  if (!Array.isArray(json.timeline) || json.timeline.length === 0) {
    warnings.push(`${label} 缺少 timeline，已注入占位`);
    json.timeline = [
      { when: "未知", event: "调研未整理出完整时间线", impactOnThinking: "待补充素材后完善" }
    ];
  }
  if (!json.sources || typeof json.sources !== "object") {
    json.sources = { primary: [], secondary: [] };
    warnings.push(`${label} 缺少 sources，已注入空结构`);
  }
}

/**
 * LLM 常漏掉「创建时已知」的硬字段（sourceType/track/roleplay 字面量等）。
 * 用 config 补齐，避免调研齐全却因缺字段整卡作废。就地改 `json`。
 *
 * @param json LLM 返回的卡草稿（会被写入 meta/roleplay/identity）
 * @param input 创建时已知的角色名 / 来源 / 赛道
 * @param warnings 记录补齐了哪些字段
 * @param label 告警前缀（如 `[phase2·passB]`）
 */
export function seedRequiredCardFields(
  json: Record<string, unknown>,
  input: Pick<FrameworkSynthesisInput, "characterName" | "sourceType" | "track">,
  warnings: string[],
  label: string
): void {
  const metaRaw = json.meta;
  const meta: Record<string, unknown> =
    metaRaw != null && typeof metaRaw === "object" && !Array.isArray(metaRaw)
      ? { ...(metaRaw as Record<string, unknown>) }
      : {};
  const patchedMeta: string[] = [];
  if (typeof meta.name !== "string" || !meta.name.trim()) {
    meta.name = input.characterName;
    patchedMeta.push("name");
  }
  if (meta.sourceType !== input.sourceType) {
    meta.sourceType = input.sourceType;
    patchedMeta.push("sourceType");
  }
  if (meta.track !== input.track) {
    meta.track = input.track;
    patchedMeta.push("track");
  }
  if (typeof meta.disclaimer !== "string" || !meta.disclaimer.trim()) {
    meta.disclaimer =
      input.sourceType === "original"
        ? "原创视角助手。"
        : `受 ${input.characterName} 启发的视角助手，非本人 / 非官方 / 非授权。`;
    patchedMeta.push("disclaimer");
  }
  if (typeof meta.avatarHint !== "string") {
    meta.avatarHint = "";
  }
  json.meta = meta;
  if (patchedMeta.length) {
    warnings.push(`${label} 已补齐 meta.${patchedMeta.join("/")}`);
  }

  const roleplayRaw = json.roleplay;
  const roleplay: Record<string, unknown> =
    roleplayRaw != null && typeof roleplayRaw === "object" && !Array.isArray(roleplayRaw)
      ? { ...(roleplayRaw as Record<string, unknown>) }
      : {};
  let roleplayPatched = false;
  if (roleplay.firstPersonOnly !== true) {
    roleplay.firstPersonOnly = true;
    roleplayPatched = true;
  }
  if (roleplay.disclaimerOnce !== true) {
    roleplay.disclaimerOnce = true;
    roleplayPatched = true;
  }
  if (!Array.isArray(roleplay.exitTriggers) || roleplay.exitTriggers.length === 0) {
    roleplay.exitTriggers = ["退出", "切回正常", "不用扮演了", "跳出角色"];
    roleplayPatched = true;
  }
  json.roleplay = roleplay;
  if (roleplayPatched) {
    warnings.push(`${label} 已补齐 roleplay 默认规则`);
  }

  const identityRaw = json.identity;
  const identity: Record<string, unknown> =
    identityRaw != null && typeof identityRaw === "object" && !Array.isArray(identityRaw)
      ? { ...(identityRaw as Record<string, unknown>) }
      : {};
  const identityPatched: string[] = [];
  if (typeof identity.selfIntro !== "string" || !identity.selfIntro.trim()) {
    identity.selfIntro = `我是 ${input.characterName}，从公开材料里蒸馏出来的视角助手。`;
    identityPatched.push("selfIntro");
  }
  if (typeof identity.origin !== "string" || !identity.origin.trim()) {
    identity.origin = "由深度调研与框架提炼装配而成。";
    identityPatched.push("origin");
  }
  json.identity = identity;
  if (identityPatched.length) {
    warnings.push(`${label} 已补齐 identity.${identityPatched.join("/")}`);
  }
}

/**
 * Pass B 常把 Pass A 候选形态（claim/domains）直接塞进 mentalModels/heuristics。
 * 在进 zod 前映射到协议字段，避免「有内容却整卡作废」。就地改 `json`。
 *
 * @param json 卡草稿
 * @param warnings 记录规范化了多少条
 * @param label 告警前缀
 */
export function normalizeMentalModelsAndHeuristics(
  json: Record<string, unknown>,
  warnings: string[],
  label: string
): void {
  let mmPatched = 0;
  if (Array.isArray(json.mentalModels)) {
    json.mentalModels = json.mentalModels.map((raw, i) => {
      if (raw == null || typeof raw !== "object") return raw;
      const m = { ...(raw as Record<string, unknown>) };
      const before = JSON.stringify(m);
      if (typeof m.id !== "string" || !m.id.trim()) m.id = `mm-${i + 1}`;
      if (typeof m.name !== "string" || !m.name.trim()) {
        m.name =
          typeof m.claim === "string" && m.claim.trim()
            ? m.claim.trim().slice(0, 40)
            : `心智模型 ${i + 1}`;
      }
      if (typeof m.oneLiner !== "string" || !m.oneLiner.trim()) {
        const fromClaim = typeof m.claim === "string" ? m.claim.trim() : "";
        const fromDesc = typeof m.description === "string" ? m.description.trim() : "";
        m.oneLiner = (fromClaim || fromDesc || String(m.name)).slice(0, 240);
      }
      if (!Array.isArray(m.evidence) || m.evidence.length === 0) {
        const refs = Array.isArray(m.evidenceRefs)
          ? m.evidenceRefs.filter((x): x is string => typeof x === "string")
          : [];
        m.evidence = refs.length > 0 ? refs.slice(0, 6) : ["来自调研档案提炼"];
      }
      if (!Array.isArray(m.appliesTo) || m.appliesTo.length === 0) {
        const domains = Array.isArray(m.domains)
          ? m.domains.filter((x): x is string => typeof x === "string")
          : [];
        m.appliesTo = domains.length > 0 ? domains.slice(0, 6) : ["综合判断"];
      }
      if (typeof m.limits !== "string" || !m.limits.trim()) {
        m.limits = "超出其公开言论与可核对行为时，推断不可当作事实。";
      }
      if (JSON.stringify(m) !== before) mmPatched += 1;
      return m;
    });
  }

  let hPatched = 0;
  if (Array.isArray(json.heuristics)) {
    json.heuristics = json.heuristics.map((raw, i) => {
      if (raw == null || typeof raw !== "object") return raw;
      const h = { ...(raw as Record<string, unknown>) };
      const before = JSON.stringify(h);
      if (typeof h.id !== "string" || !h.id.trim()) h.id = `h-${i + 1}`;
      if (typeof h.rule !== "string" || !h.rule.trim()) {
        const fromClaim = typeof h.claim === "string" ? h.claim.trim() : "";
        const fromName = typeof h.name === "string" ? h.name.trim() : "";
        h.rule = (fromClaim || fromName || `启发式 ${i + 1}`).slice(0, 200);
      }
      if (typeof h.scenario !== "string" || !h.scenario.trim()) {
        const domains = Array.isArray(h.domains)
          ? h.domains.filter((x): x is string => typeof x === "string")
          : [];
        h.scenario =
          domains.length > 0
            ? `面对涉及「${domains.slice(0, 3).join(" / ")}」的问题时`
            : "面对需要快速判断的问题时";
      }
      if (typeof h.example !== "string" && Array.isArray(h.evidence) && h.evidence[0]) {
        h.example = String(h.evidence[0]).slice(0, 400);
      }
      if (JSON.stringify(h) !== before) hPatched += 1;
      return h;
    });
  }

  if (mmPatched || hPatched) {
    warnings.push(
      `${label} 已规范化 mentalModels×${mmPatched} / heuristics×${hPatched}（claim→oneLiner 等）`
    );
  }
}

/** 把调研 doc 压成 prompt 输入；`markdownCap` 用于重试时截断正文以给输出留预算。 */
function toSynthesisInput(
  config: DistillationJobConfig,
  docs: ResearchDoc[],
  markdownCap?: number
): FrameworkSynthesisInput {
  return {
    characterName: config.characterName,
    sourceType: config.sourceType,
    track: config.track,
    researchSegments: docs.map((d) => {
      const raw =
        d.status === "ok" ? d.markdown : `> Agent ${d.agentId} 失败：${d.errorMessage ?? "未知"}`;
      const markdown =
        markdownCap != null && raw.length > markdownCap
          ? `${raw.slice(0, markdownCap)}\n…(已截断以保障提炼输出预算)`
          : raw;
      return {
        agentId: d.agentId,
        agentName: d.agentName,
        markdown,
        confidence: d.confidence
      };
    }),
    userMaterial: config.userMaterial
  };
}

/**
 * 从 LLM 正文中抠 JSON 对象：优先 markdown 代码围栏，否则取第一个 `{` 到最后一个 `}`。
 * 解析失败返回 null，不抛错。
 */
function extractJSON(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  let candidate = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fence?.[1]) candidate = fence[1];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 只保留字符串元素，最多 12 条，供 contradictions / sourceGaps 使用。 */
function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, 12);
}

/** 非法或未知 `initialTier` 一律当作 heuristic，避免 Pass A 候选整批丢弃。 */
function normalizeTier(v: unknown): SynthesisPassAResult["candidates"][0]["initialTier"] {
  if (v === "mental-model" || v === "heuristic" || v === "discard") return v;
  return "heuristic";
}

/**
 * Pass B 未产出有效 answerProtocol 时，用 LLM 或确定性回退补全（就地写 `card`）。
 *
 * @param llm 聊天适配器；失败则走 `deriveFallbackAnswerProtocol`
 * @param card 被写入 `answerProtocol` 的人格卡
 * @param warnings 记录 LLM 失败或结构无效
 */
export async function ensureAnswerProtocol(
  llm: LLMAdapter,
  card: CharacterCard,
  warnings: string[]
): Promise<void> {
  if (isAnswerProtocolValid(card.answerProtocol)) return;

  const { system, user } = buildAnswerProtocolGenerationPrompt(card);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.25,
    maxTokens: 1800,
    stream: false,
    thinking: "disabled"
  });

  if (r.kind === "done") {
    const parsed = parseAnswerProtocolFromLLM(r.text);
    if (parsed) {
      card.answerProtocol = parsed;
      return;
    }
    warnings.push("[answerProtocol] LLM 输出结构无效，使用回退路由");
  } else {
    warnings.push(`[answerProtocol] 生成失败：${r.message}`);
  }

  card.answerProtocol = deriveFallbackAnswerProtocol(card);
}
