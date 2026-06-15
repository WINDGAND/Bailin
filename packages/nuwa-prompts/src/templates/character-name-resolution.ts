/**
 * 角色双语名称解析：在造人流程中产出固定的「中文名 + 英文名」对。
 */

export interface CharacterNameResolutionInput {
  characterName: string;
  sourceType: "public-figure" | "fictional" | "original";
  /** 人格卡或调研阶段已产出的候选名，供 LLM 参考。 */
  hints?: {
    name?: string;
    sourceName?: string;
    chineseName?: string;
    englishName?: string;
  };
}

export function buildCharacterNameResolutionPrompt(
  input: CharacterNameResolutionInput
): { system: string; user: string } {
  const { characterName, sourceType, hints } = input;

  const system = [
    "你是百灵 Bailin 的角色命名专员。",
    "你的唯一任务：为角色确定一对固定的双语显示名。",
    "",
    "输出纪律：",
    "1. 只输出 JSON，不要 markdown，不要解释。",
    "2. chineseName 必须是中文（可含间隔号 ·，如「科比·布莱恩特」）。",
    "3. englishName 必须是拉丁字母英文名（可含空格、点、连字符）。",
    "4. 两行名称必须都填写，不可留空。",
    "",
    "命名规则：",
    "- 中国 / 华人公众人物：中文名用大众最熟知的写法；英文名优先查官方或媒体常用英文译名（如 周杰伦 → Jay Chou，不是 Zhou Jielun）。",
    "- 没有常用英文译名的华人：英文名用汉语拼音，格式 GivenName FamilyName（如 张雪峰 → Xuefeng Zhang）。",
    "- 外国公众人物 / 虚构角色：中文名用中文世界最常见的译名（如 Kobe Bryant → 科比·布莱恩特，Violet Evergarden → 薇尔莉特·伊芙加登）。",
    "- 外国角色 englishName 用原作语言最常见的写法（通常与输入一致）。",
    "- 不要附加「· 视角助手」「· 灵感角色」等后缀。",
    "- 中日韩动漫角色：中文名遵循大陆常见译名；英文名用罗马字官方写法。",
    "",
    "JSON 格式：",
    '{ "chineseName": "string", "englishName": "string" }'
  ].join("\n");

  const userParts = [
    `请解析角色「${characterName}」的双语显示名。`,
    `类型：${sourceType}。`
  ];

  if (hints?.name || hints?.sourceName || hints?.chineseName || hints?.englishName) {
    userParts.push("", "已有候选（可参考，但以你的检索/知识为准）：");
    if (hints.chineseName) userParts.push(`- chineseName: ${hints.chineseName}`);
    if (hints.englishName) userParts.push(`- englishName: ${hints.englishName}`);
    if (hints.name) userParts.push(`- name: ${hints.name}`);
    if (hints.sourceName) userParts.push(`- sourceName: ${hints.sourceName}`);
  }

  userParts.push("", "请联网或基于可靠知识查找，直接输出 JSON。");

  return { system, user: userParts.join("\n") };
}
