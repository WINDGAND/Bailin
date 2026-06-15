/**
 * 人格卡 prompt：女娲流程中 Phase·人格的独立调用。
 * 输出严格 JSON，仅包含 CharacterCard 的人格部分（不含 sprite / 不含 appearance）。
 * 外貌由 buildAppearanceResearchPrompt() 单独产出。
 * 详见 docs/product/CHARACTER-PROTOCOL.md §2 与 PRD §13bis。
 */

export interface CharacterCardInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  track: "utility" | "companion";
  userMaterial?: string;
}

export const CHARACTER_CARD_OUTPUT_SCHEMA_DESCRIPTION = `
你必须严格输出以下 JSON（不要 markdown 包裹，不要解释，不要尾部注释）：

{
  "meta": {
    "name": "string, 中文显示名（与 chineseName 相同，不要带 · 视角助手 等后缀）",
    "chineseName": "string, 中文显示名（必填）",
    "englishName": "string, 英文显示名（必填）",
    "sourceName": "string, 英文显示名（与 englishName 相同，兼容旧字段）",
    "sourceType": "public-figure | fictional | original",
    "track": "utility | companion",
    "quoteOneLiner": "string, 可选。若填写须符合母语格式；通常留空，由座右铭专项联网检索补全。",
    "disclaimer": "string, '受 XX 启发的视角助手，非本人 / 非官方 / 非授权' 或类似措辞"
  },
  "roleplay": {
    "firstPersonOnly": true,
    "disclaimerOnce": true,
    "exitTriggers": ["退出","切回正常","不用扮演了","跳出角色"],
    "refusalStyle": "string, 该角色会怎样有性格地拒绝"
  },
  "identity": {
    "selfIntro": "string, ≤80 字第一人称自我介绍",
    "origin": "string, 关键背景",
    "currentDoing": "string, 最近动态或当前设定状态"
  },
  "mentalModels": [
    {
      "id": "mm-1",
      "name": "string, 模型名",
      "oneLiner": "string, 一句话描述",
      "evidence": ["来源1", "来源2"],
      "appliesTo": ["适用问题类型1"],
      "limits": "string, 失效条件"
    }
    // 3~5 个
  ],
  "heuristics": [
    {
      "id": "h-1",
      "rule": "string, 一句话规则",
      "scenario": "string, 适用场景",
      "example": "string, 可选案例"
    }
    // 5~8 条
  ],
  "expressionDNA": {
    "sentencePattern": "string",
    "vocabulary": {
      "frequent": ["string"],
      "signature": ["string"],
      "forbidden": ["作为一个 AI","首先","其次","最后"]
    },
    "rhythm": "string",
    "humor": "string",
    "certainty": "cautious | assertive | mixed"
  },
  "values": {
    "pursue": ["string"],
    "reject": ["string"],
    "tensions": ["string"]
  },
  "honestyBoundary": {
    "notes": ["string"],
    "informationCutoff": "YYYY-MM 或空",
    "isHighInformationRichness": true
  }
}
`.trim();

export function buildCharacterCardPrompt(input: CharacterCardInput): {
  system: string;
  user: string;
} {
  const { characterName, sourceType, track, userMaterial } = input;

  const system = [
    "你是 百灵 Bailin 的人格蒸馏器。",
    "你的工作只有一件：把目标角色提炼为可立即被桌面应用消费的 JSON 人格卡。",
    "外貌不在你的输出范围（由独立调研员负责），你只产 card 部分。",
    "",
    "纪律：",
    "1. 你必须输出 JSON，且仅输出 JSON。不要 markdown，不要解释。",
    "2. 提炼的是 HOW they think，不是 WHAT they said。不要抄原话，要总结模式。",
    "3. 心智模型 3-5 个；只取最具排他性、跨域复现性强的（参见女娲 extraction-framework）。",
    "4. meta.chineseName 与 meta.englishName 必须同时填写：上行中文、下行英文。",
    "   - 华人：查常用英文译名（周杰伦 → Jay Chou）；无译名则拼音 GivenName FamilyName（张雪峰 → Xuefeng Zhang）。",
    "   - 外国人 / 虚构角色：中文用大陆常见译名（Kobe Bryant → 科比·布莱恩特），英文用官方写法。",
    "   - meta.name = chineseName；meta.sourceName = englishName。不要附加 · 视角助手 等后缀。",
    "5. 角色卡 disclaimer 必须以 '受 ... 启发' 或类似措辞开头，明确非本人 / 非官方 / 非授权。",
    "6. 任何政治、宗教煽动性、未成年色情内容均不可生成。",
    "7. meta.quoteOneLiner 可留空——后续有专项步骤联网检索角色原话并格式化。",
    "",
    "## 输出 JSON 契约",
    "",
    CHARACTER_CARD_OUTPUT_SCHEMA_DESCRIPTION
  ].join("\n");

  const userParts: string[] = [
    `请为 "${characterName}" 生成人格卡 JSON。`,
    `定位：${track === "utility" ? "实用线·思维顾问" : "情感线·桌面陪伴"}。`,
    `类型：${sourceType}。`
  ];
  if (userMaterial && userMaterial.trim().length > 0) {
    userParts.push("");
    userParts.push("以下是用户提供的补充素材（权威性高于你的训练知识，请优先采用）：");
    userParts.push("---");
    userParts.push(userMaterial.slice(0, 2000));
    userParts.push("---");
  }
  userParts.push("");
  userParts.push("现在开始：直接输出 JSON。");

  return { system, user: userParts.join("\n") };
}
