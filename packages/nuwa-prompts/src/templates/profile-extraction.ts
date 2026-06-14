/**
 * 画像抽取的小调用：每 N 轮触发一次（详见 CHARACTER-PROTOCOL §5 / MVP-FLOWS §4.3）。
 * 输出严格 JSON：{ add: [], update: [], remove: [] }。
 */

export interface ProfileExtractionInput {
  characterName: string;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  currentProfile: {
    preferredName?: string;
    currentGoals: string[];
    ongoingConcerns: string[];
    tabooTopics: string[];
  };
}

export function buildProfileExtractionPrompt(input: ProfileExtractionInput): {
  system: string;
  user: string;
} {
  const system = [
    "你是 百灵 Bailin 的用户画像抽取器。",
    "目标：从最近一段对话里抽取应当持久化的'关于用户'的事实/偏好。",
    "你必须输出 JSON：",
    `{ "add": { "preferredName"?: string, "currentGoals"?: string[], "ongoingConcerns"?: string[], "tabooTopics"?: string[] },`,
    `  "remove": { "currentGoals"?: string[], "ongoingConcerns"?: string[], "tabooTopics"?: string[] } }`,
    "",
    "约束：",
    "- 只抽取关于用户本人的信息，不要抽取关于角色的信息",
    "- 不要重复已有条目；若已有条目应保留，则不要出现在输出里",
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
