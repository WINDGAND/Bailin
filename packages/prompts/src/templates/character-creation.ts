/**
 * CharacterCard JSON 契约描述：供深度框架提炼等 prompt 复用。
 * 详见 README「角色协议」与 packages/character-protocol（CharacterCard）。
 */

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
