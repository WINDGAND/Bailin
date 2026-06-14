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
    "name": "string, 显示名",
    "sourceName": "string, 被启发的真实人物 / 角色名（可选）",
    "sourceType": "public-figure | fictional | original",
    "track": "utility | companion",
    "quoteOneLiner": "string, 最能代表该角色的一句话。\n      ★ 必须先用该角色的母语 / 作品原文语言写一遍，再用全角括号 () 附简短中文译。\n      ★ 例：日本动漫 → \"自由を求めて戦う！（为了自由而战！）\"\n         欧美名人 → \"Stay hungry, stay foolish.（求知若饥，虚心若愚。）\"\n         韩国偶像 → \"꿈을 향해 달려가자!（向着梦想奔跑！）\"\n         法国哲学家 → \"L'enfer, c'est les autres.（他人即地狱。）\"\n         中文母语角色 → 直接写中文，无需括号\n      ★ 整段 ≤120 字。如果完全无法确定母语，回退到训练知识里最常见的引用形式即可。",
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
    "4. 角色卡 disclaimer 必须以 '受 ... 启发' 或类似措辞开头，明确非本人 / 非官方 / 非授权。",
    "5. 任何政治、宗教煽动性、未成年色情内容均不可生成。",
    "6. **quoteOneLiner 必须用角色母语 / 作品原文语言**：",
    "   - 日本动漫角色 → 日语原文；",
    "   - 美 / 英 / 加 / 澳 名人 → 英文原文；",
    "   - 韩国艺人 / 角色 → 韩语原文；",
    "   - 法 / 德 / 意 / 西 名人 → 对应母语；",
    "   - 中文母语角色 → 直接中文，无需括号；",
    "   - 其余语言一律用原文 + 中文译括号。",
    "   绝不可以把外文角色的座右铭'翻译'成中文当主体输出；",
    "   也绝不可以把中文角色的话翻译成英文。",
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
