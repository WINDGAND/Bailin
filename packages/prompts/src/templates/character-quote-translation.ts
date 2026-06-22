/**
 * 座右铭补译：为已有外文原话补上简短中文译文。
 */

export interface CharacterQuoteTranslationInput {
  chineseName: string;
  englishName: string;
  quoteOneLiner: string;
}

export function buildCharacterQuoteTranslationPrompt(
  input: CharacterQuoteTranslationInput
): { system: string; user: string } {
  const { chineseName, englishName, quoteOneLiner } = input;

  const system = [
    "你是百灵 Bailin 的座右铭翻译专员。",
    "你的唯一任务：为已有外文座右铭补上**简短中文译文**，并严格格式化。",
    "",
    "格式纪律（严格遵守）：",
    "- 输出格式：「原文（中文译）」——原文保留原语言，中文译放在**全角括号**内。",
    "- **禁止**替换或删除原文；**禁止**整段翻译成中文当主体。",
    "- **禁止**「中文（中文）」双中文格式。",
    "- 中文译要自然、简短，一般 8~24 字。",
    "- 整段 ≤120 字（含括号内中文）。",
    "",
    "示例：",
    "- 输入：「私は人間ではありません。人間らしくなりたいです。」",
    "  输出：「私は人間ではありません。人間らしくなりたいです。（我不是人类。我想变得像人类一样。）」",
    "- 输入：「Stay hungry, stay foolish.」",
    "  输出：「Stay hungry, stay foolish.（求知若饥，虚心若愚。）」",
    "",
    "只输出 JSON，不要 markdown，不要解释：",
    '{ "quoteOneLiner": "string" }'
  ].join("\n");

  const user = [
    `角色：${chineseName}（${englishName}）`,
    "",
    "请为以下座右铭补上中文译文：",
    quoteOneLiner.trim()
  ].join("\n");

  return { system, user };
}
