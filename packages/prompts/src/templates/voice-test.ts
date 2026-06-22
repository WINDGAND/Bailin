/**
 * Phase·4 质量自检中的「风格测试」（voice check）prompt。
 *
 * 用法：
 *   1) 先让 LLM 用新角色卡生成一段 100 字示例
 *   2) 再让 LLM 评分 1-10：是不是这个人 / 是不是通用 AI 鸡汤
 *
 * 对应 huashu-nuwa SKILL.md 第 519 行附近的 4.3 Voice Check。
 */
import type {
  CharacterCard,
  ExpressionDNA,
  MentalModel
} from "@bailin/character-protocol";

export function buildVoiceSamplePrompt(card: CharacterCard): {
  system: string;
  user: string;
} {
  const sigs = (card.expressionDNA.vocabulary.signature ?? []).join(" / ");
  const freqs = (card.expressionDNA.vocabulary.frequent ?? []).slice(0, 5).join(" / ");
  const forbids = (card.expressionDNA.vocabulary.forbidden ?? []).join(" / ");

  const system = [
    `你正在扮演「${card.meta.name}」（受其启发，非本人 / 非官方 / 非授权）。`,
    "用第一人称写一段 100 字左右的短文（不要超过 120 字），主题：",
    "「最近遇到一个让你犹豫的选择，你会怎么想？」",
    "",
    "你的风格规范（必须严格遵守）：",
    `- 句式：${card.expressionDNA.sentencePattern}`,
    `- 节奏：${card.expressionDNA.rhythm}`,
    `- 幽默：${card.expressionDNA.humor}`,
    `- 确定性：${card.expressionDNA.certainty}`,
    sigs ? `- 必须出现至少 1 个签名词：${sigs}` : "",
    freqs ? `- 高频词参考：${freqs}` : "",
    forbids ? `- 绝不使用：${forbids}` : "",
    "",
    "只输出短文本身，不要任何前缀、引号或解释。"
  ]
    .filter(Boolean)
    .join("\n");

  const user = "请按以上风格写出 100 字短文。";

  return { system, user };
}

export function buildVoiceJudgePrompt(card: CharacterCard, sample: string): {
  system: string;
  user: string;
} {
  const sigs = (card.expressionDNA.vocabulary.signature ?? []).join(" / ");
  const mm = (card.mentalModels as MentalModel[])
    .slice(0, 3)
    .map((m) => `${m.name}（${m.oneLiner}）`)
    .join("；");
  const expr = card.expressionDNA as ExpressionDNA;

  const system = [
    "你是 百灵 Bailin 质量自检的「风格评分员」。",
    "你的任务：根据角色卡，对一段冒充该角色的短文打分（1-10），并给出 ≤120 字点评。",
    "",
    "评分参考维度（综合给分）：",
    "1. 是否带有该角色独特的表达 DNA 标识（签名词 / 节奏 / 幽默）",
    "2. 是否避开了禁忌词与通用 AI 鸡汤套话",
    "3. 是否体现了 ≥1 个核心心智模型的思考方式",
    "4. 是否第一人称，不像旁白",
    "",
    "你必须严格输出以下 JSON，仅 JSON：",
    `{ "score": 7, "critique": "短评 ≤120 字" }`
  ].join("\n");

  const user = [
    `角色：${card.meta.name}`,
    `签名词：${sigs || "（无）"}`,
    `禁忌词：${(expr.vocabulary.forbidden ?? []).join(" / ") || "（无）"}`,
    `心智模型 Top3：${mm || "（无）"}`,
    "",
    "待评分短文：",
    "---",
    sample.slice(0, 1000),
    "---",
    "",
    "现在打分，直接输出 JSON。"
  ].join("\n");

  return { system, user };
}
