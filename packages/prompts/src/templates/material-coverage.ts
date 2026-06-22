/**
 * 本地语料覆盖分类：判断用户素材已覆盖哪些调研维度。
 */
import type { ResearchAgentSlug } from "./research-agents.js";
import { RESEARCH_AGENT_ORDER } from "./research-agents.js";

const AGENT_ID_TO_SLUG: Record<number, ResearchAgentSlug> = {
  1: "writings",
  2: "conversations",
  3: "expression-dna",
  4: "external-views",
  5: "decisions",
  6: "timeline"
};

const AGENT_DIMENSIONS: Record<ResearchAgentSlug, string> = {
  writings: "著作、长文、系统思考、自创术语、书单",
  conversations: "长访谈、播客、即兴对话、立场变化",
  "expression-dna": "社媒碎片、金句、口癖、表达风格",
  "external-views": "传记、外部评价、批评、同行对比",
  decisions: "重大决策、行为记录、言行一致/不一致",
  timeline: "生平里程碑、时间线、近 12 个月动态"
};

export interface MaterialCoverageResult {
  /** 素材已充分覆盖，可直接用本地摘要、无需联网。 */
  coveredAgentIds: Array<1 | 2 | 3 | 4 | 5 | 6>;
  /** 素材部分覆盖，用本地摘要 + 不联网 LLM 整理。 */
  partialAgentIds: Array<1 | 2 | 3 | 4 | 5 | 6>;
  /** 素材未覆盖，需要联网调研。 */
  gapAgentIds: Array<1 | 2 | 3 | 4 | 5 | 6>;
  /** agentId → 该维度的 Markdown 本地摘要（≥200 字）。 */
  localSummaries: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, string>>;
}

export function buildMaterialCoveragePrompt(input: {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  userMaterial: string;
}): { system: string; user: string } {
  const dimensionLines = RESEARCH_AGENT_ORDER.map((slug, i) => {
    const id = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    return `- Agent ${id}（${slug}）：${AGENT_DIMENSIONS[slug]}`;
  });

  const system = [
    "你是百灵 Bailin 的「素材覆盖分类器」。",
    "任务：阅读用户提供的一手素材，判断 6 路调研维度哪些已被充分覆盖。",
    "",
    "分类标准：",
    "- covered：素材中有足够信息写一份 ≥400 字的该维度调研（含具体事实/引述）",
    "- partial：素材有相关线索但不够完整",
    "- gap：素材几乎不涉及该维度",
    "",
    "对每个 covered / partial 维度，在 localSummaries 中写 Markdown 摘要（含 ## 标题、列表、## 自评 confidence: high|medium|low）。",
    "covered 的摘要应标注「（用户一手素材）」；不要编造素材中没有的内容。",
    "",
    "只输出 JSON：",
    `{`,
    `  "coveredAgentIds": [1, 2],`,
    `  "partialAgentIds": [3],`,
    `  "gapAgentIds": [4, 5, 6],`,
    `  "localSummaries": { "1": "## ...", "2": "## ..." }`,
    `}`
  ].join("\n");

  const user = [
    `角色：${input.characterName}`,
    `类型：${input.sourceType}`,
    "",
    "## 六个调研维度",
    ...dimensionLines,
    "",
    "## 用户素材",
    input.userMaterial.slice(0, 12000),
    "",
    "现在分类并输出 JSON。"
  ].join("\n");

  return { system, user };
}

export function parseMaterialCoverage(raw: string): MaterialCoverageResult | null {
  const json = extractJson(raw);
  if (!json) return null;

  const covered = normalizeAgentIds(json.coveredAgentIds);
  const partial = normalizeAgentIds(json.partialAgentIds);
  const gap = normalizeAgentIds(json.gapAgentIds);
  const summariesRaw = json.localSummaries;
  const localSummaries: MaterialCoverageResult["localSummaries"] = {};

  if (summariesRaw && typeof summariesRaw === "object") {
    for (const [k, v] of Object.entries(summariesRaw as Record<string, unknown>)) {
      const id = Number(k) as 1 | 2 | 3 | 4 | 5 | 6;
      if (id >= 1 && id <= 6 && typeof v === "string" && v.trim().length > 100) {
        localSummaries[id] = v.trim().slice(0, 6000);
      }
    }
  }

  // 确保每个 id 只出现在一个桶里
  const coveredSet = new Set(covered);
  const partialFiltered = partial.filter((id) => !coveredSet.has(id));
  const gapFiltered = gap.filter((id) => !coveredSet.has(id) && !partialFiltered.includes(id));

  // 未分配的 agent 默认 gap
  const allIds = [1, 2, 3, 4, 5, 6] as const;
  for (const id of allIds) {
    if (!coveredSet.has(id) && !partialFiltered.includes(id) && !gapFiltered.includes(id)) {
      gapFiltered.push(id);
    }
  }

  return {
    coveredAgentIds: covered,
    partialAgentIds: partialFiltered,
    gapAgentIds: gapFiltered,
    localSummaries
  };
}

export function slugForAgentId(id: number): ResearchAgentSlug | undefined {
  return AGENT_ID_TO_SLUG[id as 1 | 2 | 3 | 4 | 5 | 6];
}

export function agentNameForSlug(slug: ResearchAgentSlug): string {
  const names: Record<ResearchAgentSlug, string> = {
    writings: "著作与系统思考",
    conversations: "长对话与即兴思考",
    "expression-dna": "碎片表达与风格",
    "external-views": "外部观察与批评",
    decisions: "决策与行动",
    timeline: "人物时间线"
  };
  return names[slug];
}

function normalizeAgentIds(v: unknown): Array<1 | 2 | 3 | 4 | 5 | 6> {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "number" ? x : Number(x)))
    .filter((n): n is 1 | 2 | 3 | 4 | 5 | 6 => n >= 1 && n <= 6);
}

function extractJson(text: string): Record<string, unknown> | null {
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
