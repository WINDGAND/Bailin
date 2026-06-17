/**
 * 画像抽取的小调用：每 N 轮触发一次。
 * 输出 JSON：{ add: { preferredName?, facts: [{category, text}] }, remove: { facts: [...] } }
 */

export interface ProfileExtractionInput {
  characterName: string;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  currentProfile: {
    preferredName?: string;
    facts: Array<{ category: string; text: string }>;
  };
}

export function buildProfileExtractionPrompt(input: ProfileExtractionInput): {
  system: string;
  user: string;
} {
  const system = [
    "你是 百灵 Bailin 的用户画像抽取器。",
    "目标：从最近一段对话里抽取应当持久化的「关于用户本人」的事实/偏好，并归入合适分类。",
    "你必须输出 JSON：",
    `{ "add": { "preferredName"?: string, "facts"?: [{ "category": string, "text": string }] },`,
    `  "remove": { "facts"?: [{ "category": string, "text": string }] } }`,
    "",
    "category 必须是以下之一：",
    "- identity：基础信息（职业、城市、年龄层、身份背景等）",
    "- goal：当前目标/计划/正在推进的项目",
    "- concern：长期烦恼、反复出现的情绪背景（非一次性吐槽）",
    "- boundary：用户明确说「别提/别聊/不想听」的避讳话题",
    "- interest：兴趣爱好（运动、游戏、音乐、二次元等）",
    "- skill：特长、技能、专业优势",
    "- preference：偏好习惯（作息、沟通风格、饮食偏好等）",
    "- other：以上都不合适但有长期价值的用户信息",
    "",
    "示例 facts：",
    '- { "category": "identity", "text": "在上海做产品经理" }',
    '- { "category": "interest", "text": "喜欢徒步和摄影" }',
    '- { "category": "goal", "text": "准备找下一份工作" }',
    '- { "category": "boundary", "text": "不要提前任" }',
    "",
    "约束：",
    "- 只抽取关于用户本人的信息，不要抽取关于角色的信息",
    "- 每条 text 用一句简短中文（≤30 字）",
    "- 不要重复已有条目（按 text 语义去重）；已有则不出现在 add",
    "- boundary 必须用户明确表达避讳，不要猜测",
    "- remove 仅用于用户明确说某信息已过时/不再适用/不再避讳",
    "- 若没有任何更新，输出 { \"add\": {}, \"remove\": {} }",
    "- 不要输出 markdown 包裹"
  ].join("\n");

  const userLines: string[] = [];
  userLines.push("当前画像：");
  userLines.push(JSON.stringify(input.currentProfile, null, 2));
  userLines.push("");
  userLines.push(`角色名：${input.characterName}`);
  userLines.push("最近对话：");
  for (const t of input.recentTurns.slice(-10)) {
    userLines.push(`${t.role}: ${t.content.slice(0, 400)}`);
  }
  userLines.push("");
  userLines.push("现在请输出 JSON。");

  return { system, user: userLines.join("\n") };
}
