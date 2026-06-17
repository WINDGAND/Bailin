import type { CharacterCard, QualityReport, ResearchDoc } from "@nuwa-pet/character-protocol";
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
} from "@nuwa-pet/nuwa-prompts";
import type { DistillationJobConfig } from "@nuwa-pet/character-protocol";
import { isAnswerProtocolValid, parseCard, SCHEMA_VERSION } from "@nuwa-pet/character-protocol";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

export const MAX_SYNTHESIS_ROUNDS = 2;
export const RESYNTHESIS_SCORE_THRESHOLD = 0.65;

export interface TwoPhaseSynthesisResult {
  card: CharacterCard | null;
  passA: SynthesisPassAResult | null;
}

export interface TargetedResynthesisPatch {
  mentalModels: CharacterCard["mentalModels"];
  heuristics: CharacterCard["heuristics"];
  honestyNotesAppend?: string[];
  tensionsAppend?: string[];
}

/** 两阶段提炼：Pass A 扫描 → Pass B 完整 card。Pass A 失败时回退单次提炼。 */
export async function runTwoPhaseSynthesis(
  llm: LLMAdapter,
  config: DistillationJobConfig,
  docs: ResearchDoc[],
  warnings: string[]
): Promise<TwoPhaseSynthesisResult> {
  const input = toSynthesisInput(config, docs);
  const passA = await runPassA(llm, input, warnings);
  if (!passA) {
    warnings.push("[phase2·passA] 扫描失败，回退单次提炼");
    const card = await runLegacySinglePassSynthesis(llm, input, warnings);
    if (card) {
      await ensureAnswerProtocol(llm, card, warnings);
    }
    return { card, passA: null };
  }

  const card = await runPassB(llm, input, passA, warnings);
  if (card) {
    await ensureAnswerProtocol(llm, card, warnings);
  }
  return { card, passA };
}

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
    stream: false
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

/** 是否应触发定向重提炼（Sanity/Edge 失败或总分过低）。 */
export function shouldTriggerResynthesis(report: QualityReport): boolean {
  if (report.overallScore < RESYNTHESIS_SCORE_THRESHOLD) return true;
  if (report.verdict === "fail") return true;
  if (report.sanityTest && !report.sanityTest.overallPass) return true;
  if (report.edgeTest && !report.edgeTest.pass) return true;
  return false;
}

/** 达上限仍不通过：在诚实边界标注薄弱维度。 */
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

async function runPassA(
  llm: LLMAdapter,
  input: FrameworkSynthesisInput,
  warnings: string[]
): Promise<SynthesisPassAResult | null> {
  const { system, user } = buildSynthesisPassAPrompt(input);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.25,
    maxTokens: 4500,
    stream: false
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·passA] LLM 失败：${r.message}`);
    return null;
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

async function runPassB(
  llm: LLMAdapter,
  input: FrameworkSynthesisInput,
  passA: SynthesisPassAResult,
  warnings: string[]
): Promise<CharacterCard | null> {
  const { system, user } = buildSynthesisPassBPrompt(input, passA);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.3,
    maxTokens: 5500,
    stream: false
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·passB] LLM 失败：${r.message}`);
    return null;
  }
  return parseCardFromLLM(r.text, warnings, "[phase2·passB]");
}

async function runLegacySinglePassSynthesis(
  llm: LLMAdapter,
  input: FrameworkSynthesisInput,
  warnings: string[]
): Promise<CharacterCard | null> {
  const { system, user } = buildFrameworkSynthesisPrompt(input);
  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.3,
    maxTokens: 5000,
    stream: false
  });
  if (r.kind === "error") {
    warnings.push(`[phase2·legacy] LLM 失败：${r.message}`);
    return null;
  }
  return parseCardFromLLM(r.text, warnings, "[phase2·legacy]");
}

function parseCardFromLLM(
  text: string,
  warnings: string[],
  label: string
): CharacterCard | null {
  const json = extractJSON(text) as Record<string, unknown> | null;
  if (!json) {
    warnings.push(`${label} 未返回合法 JSON`);
    return null;
  }
  ensureTimelineAndSources(json, warnings, label);
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

function toSynthesisInput(
  config: DistillationJobConfig,
  docs: ResearchDoc[]
): FrameworkSynthesisInput {
  return {
    characterName: config.characterName,
    sourceType: config.sourceType,
    track: config.track,
    researchSegments: docs.map((d) => ({
      agentId: d.agentId,
      agentName: d.agentName,
      markdown:
        d.status === "ok" ? d.markdown : `> Agent ${d.agentId} 失败：${d.errorMessage ?? "未知"}`,
      confidence: d.confidence
    })),
    userMaterial: config.userMaterial
  };
}

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

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").slice(0, 12);
}

function normalizeTier(v: unknown): SynthesisPassAResult["candidates"][0]["initialTier"] {
  if (v === "mental-model" || v === "heuristic" || v === "discard") return v;
  return "heuristic";
}

/** Pass B 未产出有效 answerProtocol 时，用 LLM 或确定性回退补全。 */
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
    stream: false
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
