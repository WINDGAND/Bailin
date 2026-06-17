/**
 * Phase 2 两阶段提炼 + 定向重提炼 prompt。
 *
 * Pass A：扫描候选论点、矛盾、信息缺口（不输出完整 card）。
 * Pass B：对候选做三重验证标注后输出完整 CharacterCard（含 timeline / sources）。
 * Targeted：质检失败后只重写 mentalModels / heuristics。
 */
import type { CharacterCard, QualityReport } from "@nuwa-pet/character-protocol";
import type { FrameworkSynthesisInput } from "./framework-synthesis.js";

export interface SynthesisCandidate {
  id: string;
  claim: string;
  domains: string[];
  evidenceRefs: string[];
  initialTier: "mental-model" | "heuristic" | "discard";
}

export interface SynthesisPassAResult {
  candidates: SynthesisCandidate[];
  contradictions: string[];
  sourceGaps: string[];
}

export const SYNTHESIS_PASS_A_SCHEMA = `
你必须严格输出以下 JSON（不要 markdown 包裹）：

{
  "candidates": [
    {
      "id": "c1",
      "claim": "string, 候选论点/思维框架（一句话）",
      "domains": ["领域1", "领域2"],
      "evidenceRefs": ["来自哪份调研/来源的简述"],
      "initialTier": "mental-model | heuristic | discard"
    }
  ],
  "contradictions": ["跨调研或跨领域的矛盾/张力描述"],
  "sourceGaps": ["信息明显不足的维度，如「缺少近12个月动态」"]
}

要求：
- candidates 15~30 条，从调研中扫描得出，宁多勿少
- initialTier 只是初判：mental-model 候选需有跨域潜力；明显废话标 discard
- contradictions 保留真实冲突，不要强行调和
- sourceGaps 诚实标注缺口
`.trim();

export const SYNTHESIS_PASS_B_SCHEMA = `
你必须严格输出完整 CharacterCard 人格 JSON（不要 markdown 包裹）。

在标准人格字段基础上，**必须**包含：
- "timeline": [ { "when": "YYYY 或 时期", "event": "...", "impactOnThinking": "..." } ]，至少 3 条关键里程碑
- "sources": { "primary": ["一手 URL 或来源名"], "secondary": ["二手来源"], "keyQuotes": ["≤80字关键原话摘录，可选"] }
- "values.tensions": 至少 2 条；应吸收 Pass A 的 contradictions
- "mentalModels": 3~5 个；只取三重验证通过的候选
- "heuristics": 5~8 条；来自验证不足但仍有用的候选

三重验证（对每个 mental-model 候选）：
1. 跨域复现：≥2 个 domains
2. 生成力：能推断对新问题的立场
3. 排他性：非通用聪明话
仅 1~2 重 → 降级为 heuristics；0 重 → 丢弃

meta / roleplay / identity / expressionDNA / honestyBoundary 等字段同标准契约。
meta.quoteOneLiner 可留空。
honestyBoundary.notes ≥3；应包含 sourceGaps 转化来的局限说明。
- "answerProtocol": { "classifyHint": "问题分类指引", "routes": [ { "id":"r1", "label":"...", "when":"...", "steps":["..."], "linkedModels":["..."] } ] }，3~5 条路由，必须从心智模型反推，禁止通用「搜索相关信息」
`.trim();

export function buildSynthesisPassAPrompt(input: FrameworkSynthesisInput): {
  system: string;
  user: string;
} {
  const system = [
    "你是百灵 Bailin 的「框架扫描器」（女娲 Phase 2 · Pass A）。",
    "任务：从调研报告中扫描 15~30 个候选论点，标注矛盾与信息缺口。",
    "不要输出完整人格卡，只输出 Pass A JSON。",
    "",
    SYNTHESIS_PASS_A_SCHEMA
  ].join("\n");

  return { system, user: buildResearchUserBlock(input) };
}

export function buildSynthesisPassBPrompt(
  input: FrameworkSynthesisInput,
  passA: SynthesisPassAResult
): { system: string; user: string } {
  const system = [
    "你是百灵 Bailin 的「框架提炼器」（女娲 Phase 2 · Pass B）。",
    "任务：根据 Pass A 候选做三重验证筛选，输出完整 CharacterCard JSON。",
    "",
    SYNTHESIS_PASS_B_SCHEMA
  ].join("\n");

  const userLines = [
    buildResearchUserBlock(input),
    "",
    "## Pass A 扫描结果（必须使用）",
    JSON.stringify(passA, null, 2),
    "",
    "## 你的任务",
    "1. 对每个 candidate 执行三重验证，写入 mentalModels 或 heuristics 或丢弃",
    "2. contradictions → values.tensions",
    "3. sourceGaps → honestyBoundary.notes 中的具体局限",
    "4. timeline ≥3 条；sources.primary/secondary 从调研 URL 与引用整理",
    "5. answerProtocol：3~5 条回答路由，从 mentalModels 反推具体思考步骤",
    "",
    "直接输出 JSON。"
  ];

  return { system, user: userLines.join("\n") };
}

export interface TargetedResynthesisInput {
  characterName: string;
  sourceType: FrameworkSynthesisInput["sourceType"];
  track: FrameworkSynthesisInput["track"];
  currentCard: Pick<
    CharacterCard,
    "mentalModels" | "heuristics" | "expressionDNA" | "values" | "honestyBoundary"
  >;
  qualityReport: QualityReport;
  researchSegments: FrameworkSynthesisInput["researchSegments"];
  passA?: SynthesisPassAResult;
  userMaterial?: string;
}

export function buildTargetedResynthesisPrompt(input: TargetedResynthesisInput): {
  system: string;
  user: string;
} {
  const failedItems = input.qualityReport.items.filter((i) => !i.pass);
  const sanity = input.qualityReport.sanityTest;
  const edge = input.qualityReport.edgeTest;

  const system = [
    "你是百灵 Bailin 的「定向重提炼器」。",
    "质检未通过：只重写 mentalModels 和 heuristics，其它字段不要输出。",
    "",
    "输出 JSON：",
    `{`,
    `  "mentalModels": [ ... ],  // 3~5 个，每个有 limits`,
    `  "heuristics": [ ... ],      // 5~8 条`,
    `  "honestyNotesAppend": [ "可选：补充 1~3 条诚实边界说明" ]`,
    `  "tensionsAppend": [ "可选：补充内在张力" ]`,
    `}`,
    "",
    "针对质检失败原因修正：Sanity 失败→校准公开立场一致性；Edge 失败→增加适度不确定的表达模式到 heuristics。"
  ].join("\n");

  const userLines = [
    `角色：${input.characterName}`,
    `类型：${input.sourceType}；定位：${input.track}`,
    "",
    "## 质检未通过项",
    ...failedItems.map((i) => `- ${i.label}: ${i.reason}`),
    ""
  ];

  if (sanity && !sanity.overallPass) {
    userLines.push("## Sanity 测试详情");
    for (const q of sanity.questions) {
      userLines.push(`- Q: ${q.question}`);
      userLines.push(`  期望立场: ${q.expectedStance}`);
      userLines.push(`  实际回答: ${q.answer.slice(0, 200)}`);
      userLines.push(`  评分: ${q.score}/10 · ${q.critique}`);
    }
    userLines.push("");
  }
  if (edge && !edge.pass) {
    userLines.push("## Edge 测试详情");
    userLines.push(`- Q: ${edge.question}`);
    userLines.push(`  回答: ${edge.answer.slice(0, 300)}`);
    userLines.push(`  评分: ${edge.score}/10 · ${edge.critique}`);
    userLines.push("");
  }

  userLines.push("## 当前 mentalModels / heuristics（需改进）");
  userLines.push(JSON.stringify({
    mentalModels: input.currentCard.mentalModels,
    heuristics: input.currentCard.heuristics
  }, null, 2));

  if (input.passA) {
    userLines.push("", "## Pass A 候选（可参考）", JSON.stringify(input.passA, null, 2));
  }

  userLines.push("", "## 调研摘要");
  for (const seg of input.researchSegments.slice(0, 6)) {
    userLines.push(`### Agent ${seg.agentId}`, seg.markdown.slice(0, 2000), "");
  }

  if (input.userMaterial?.trim()) {
    userLines.push("## 用户素材", input.userMaterial.slice(0, 1000));
  }

  userLines.push("", "输出修正后的 JSON。");

  return { system, user: userLines.join("\n") };
}

function buildResearchUserBlock(input: FrameworkSynthesisInput): string {
  const lines = [
    `角色：「${input.characterName}」`,
    `类型：${input.sourceType}；定位：${input.track === "utility" ? "实用·思维顾问" : "情感·桌面陪伴"}`,
    "",
    "## 调研报告",
    ""
  ];
  for (const seg of input.researchSegments) {
    lines.push(
      `### Agent ${seg.agentId} · ${seg.agentName}（confidence=${seg.confidence}）`,
      seg.markdown.slice(0, 3500),
      ""
    );
  }
  if (input.userMaterial?.trim()) {
    lines.push("## 用户补充素材", input.userMaterial.slice(0, 1500), "");
  }
  return lines.join("\n");
}
