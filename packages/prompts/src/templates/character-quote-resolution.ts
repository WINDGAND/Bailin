/**
 * 角色座右铭专项检索：联网查找角色亲口说过的代表性原话。
 */

export interface CharacterQuoteResolutionInput {
  chineseName: string;
  englishName: string;
  sourceType: "public-figure" | "fictional" | "original";
  /** 出处 / 身份消歧义锚点（如「斩赤红之瞳」），来自身份契约。 */
  sourceContext?: string;
  /** 身份定位提示（如「男主角」），来自身份契约。 */
  identityHint?: string;
  /** 人格卡阶段产出的候选，供参考；若格式不对会被覆盖。 */
  hintQuote?: string;
  userMaterial?: string;
}

export function buildCharacterQuoteResolutionPrompt(
  input: CharacterQuoteResolutionInput
): { system: string; user: string } {
  const { chineseName, englishName, sourceType, sourceContext, identityHint, hintQuote, userMaterial } =
    input;

  const system = [
    "你是百灵 Bailin 的角色座右铭检索专员。",
    "你的唯一任务：找到该角色**亲口说过**的一句最具代表性的话，并按要求格式化。",
    "",
    "检索纪律：",
    "1. **必须联网搜索**（维基、访谈、原作台词、官方语录、可靠媒体报道）。",
    "2. 必须是这个角色**自己说**的话——不是旁白、不是粉丝二创、不是网友总结。",
    "3. 优先选：最广为人知 / 最常引用 / 最能概括其人设或思想的那一句。",
    "4. 找不到确凿原话时，选最接近的公开言论并标注 confidence=medium；绝不可凭空编造。",
    "5. 只输出 JSON，不要 markdown，不要解释。",
    "5.5. **如果提供了 sourceContext（出处 / 身份锚点），必须确认这句话确实出自该出处的这个角色**——",
    "   同名角色在不同作品可能有完全不同的台词，禁止把其它作品/同名角色的台词错配给目标角色。",
    "6. 除 quoteOneLiner 外，必须额外返回：",
    "   - speaker：你核实到的实际说话人姓名（应与目标角色一致，不一致就不要用这句话）",
    "   - work：这句话的出处作品/节目/访谈名称",
    "   - sourceUrl：你联网检索到的确凿来源链接（必须是你实际访问/引用过的 URL；没有确凿来源就填空字符串 \"\"，绝不可编造 URL）",
    "   speaker 或 work 与目标角色不一致时，宁可 quoteOneLiner 留空字符串，也不要输出格式正确但归属错误的台词。",
    "",
    "格式纪律（严格遵守）：",
    "- **中文母语角色**（如中国公众人物、以中文创作的角色）：",
    "  直接写中文原话，不要括号，不要翻译。",
    "  例：「选择比努力更重要，但'有得选'的前提是你足够努力。」",
    "- **非中文母语角色**（日本动漫、欧美名人、韩流、法德西等）：",
    "  **必须**先用**母语/作品原文语言**写原话，再用**全角括号**附简短中文译。",
    "  缺少中文译文的纯外文输出视为不合格。",
    "  例（日语）：「愛してるよ、少佐。（我爱你，少佐。）」",
    "  例（英语）：「Stay hungry, stay foolish.（求知若饥，虚心若愚。）」",
    "  例（韩语）：「꿈을 향해 달려가자!（向着梦想奔跑！）」",
    "- 日本动漫 / 轻小说角色 → 优先日语原文（不是中文配音稿）。",
    "- 美国 / 英国公众人物 → 英语原文。",
    "- 整段 ≤120 字（含括号内中文）。",
    "- **禁止**把外文角色的话整段翻译成中文当主体；",
    "- **禁止**「中文（中文）」这种双中文格式。",
    "",
    "JSON 格式：",
    '{ "quoteOneLiner": "string", "speaker": "string", "work": "string", "sourceUrl": "string", "sourceLanguage": "ja|en|zh|ko|...", "confidence": "high|medium" }'
  ].join("\n");

  const userParts = [
    `角色：${chineseName}（${englishName}）`,
    `类型：${sourceType}。`,
    "",
    "请联网检索该角色最具代表性的一句**原话**，直接输出 JSON。"
  ];

  if (sourceContext && sourceContext.trim().length > 0) {
    userParts.push(
      "",
      `出处 / 身份锚点：${sourceContext.trim()}（台词必须确认出自这个出处的这个角色）。`
    );
  }
  if (identityHint && identityHint.trim().length > 0) {
    userParts.push(`身份定位提示：${identityHint.trim()}`);
  }

  if (hintQuote?.trim()) {
    userParts.push("", `候选（可能格式不对，请重新检索验证）：${hintQuote.trim()}`);
  }
  if (userMaterial?.trim()) {
    userParts.push("", "用户补充素材（若含真实引语，优先采用）：", userMaterial.trim().slice(0, 800));
  }

  return { system, user: userParts.join("\n") };
}
