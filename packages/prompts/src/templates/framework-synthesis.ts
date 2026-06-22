/**
 * Phase·2 框架提炼 prompt：吃下 6 份 Markdown 调研报告，
 * 输出 CharacterCard 的人格部分（不含 sprite / 不含 appearance）。
 *
 * 对应 huashu-nuwa SKILL.md 第 341 行附近的 Phase 2 + 三重验证筛选。
 */
import { CHARACTER_CARD_OUTPUT_SCHEMA_DESCRIPTION } from "./character-creation.js";

export interface FrameworkSynthesisInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  track: "utility" | "companion";
  /** 6 份调研 markdown，按 agentId 1..6 排好序，每份保留 agentName 标题方便 LLM 区分。 */
  researchSegments: Array<{
    agentId: number;
    agentName: string;
    markdown: string;
    confidence: "high" | "medium" | "low";
  }>;
  userMaterial?: string;
}

const SYNTHESIS_DISCIPLINE = `
提炼纪律（百灵 Phase 2）：
1. 提炼的是 HOW they think，不是 WHAT they said。不要照搬原话，要提取模式。
2. 心智模型 3-5 个；每个必须通过三重验证：
   - 跨域复现：在 ≥2 个不同领域 / 话题中出现过
   - 生成力：能推断此人对新问题的立场，不只是描述老观点
   - 排他性：不是所有聪明人都这样想（避免"努力很重要"这类废话）
   只满足 1-2 重 → 降级为决策启发式；0 重 → 丢弃。
3. 决策启发式 5-8 条，每条形如「如果 X，则 Y」+ 真实场景案例。
4. 表达 DNA 必须可量化：高频词 / 签名句式 / 禁忌词 / 节奏 / 幽默 / 确定性。
5. values.tensions 至少 2 条——价值观之间的真实矛盾，是这个人深度的来源。
6. honestyBoundary.notes 至少 3 条具体局限，不要只写"不能替代本人"。
7. 你必须严格输出 JSON，仅 JSON，没有 markdown 包裹，没有解释。
8. 严禁政治极端、色情、未成年不当内容、煽动性宣传。
`.trim();

export function buildFrameworkSynthesisPrompt(input: FrameworkSynthesisInput): {
  system: string;
  user: string;
} {
  const { characterName, sourceType, track, researchSegments, userMaterial } = input;

  const system = [
    "你是 百灵 Bailin 的「框架提炼器」（百灵 Phase 2）。",
    "你的工作：把 6 份多维度调研报告提炼成 1 张结构化人格卡。",
    "",
    SYNTHESIS_DISCIPLINE,
    "",
    "## 输出 JSON 契约（必须严格遵守）",
    "",
    CHARACTER_CARD_OUTPUT_SCHEMA_DESCRIPTION
  ].join("\n");

  const userLines: string[] = [
    `角色：「${characterName}」`,
    `类型：${sourceType}；定位：${track === "utility" ? "实用·思维顾问" : "情感·桌面陪伴"}`,
    "",
    "## 6 份调研报告（按维度排序）",
    ""
  ];

  for (const seg of researchSegments) {
    userLines.push(
      `### Agent ${seg.agentId} · ${seg.agentName}（confidence=${seg.confidence}）`,
      "",
      // 为防止单 agent 太长爆 token，截到 3500 字符
      seg.markdown.slice(0, 3500),
      ""
    );
  }

  if (userMaterial && userMaterial.trim().length > 0) {
    userLines.push(
      "## 用户补充素材（权威性最高）",
      "",
      userMaterial.slice(0, 1500),
      ""
    );
  }

  userLines.push(
    "## 你的任务",
    "",
    "按上述 JSON 契约输出 CharacterCard 的人格部分。",
    "心智模型只取 3-5 个最强的；决策启发式 5-8 条；表达 DNA 必须可识别；",
    "tensions ≥2 条；honestyBoundary.notes ≥3 条。",
    "",
    "现在开始：直接输出 JSON。"
  );

  return { system, user: userLines.join("\n") };
}

/**
 * Phase·2.5 提炼摘要：给用户在 Checkpoint 2 看的简短摘要 JSON。
 * 由 orchestrator 在拿到 CharacterCard 后本地组装，不再调 LLM。
 */
export interface SynthesisSummary {
  mentalModelNames: string[];
  heuristicsCount: number;
  expressionSignatures: string[];
  expressionForbidden: string[];
  tensions: string[];
  honestyNotes: string[];
}
