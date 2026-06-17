import type { CharacterCard } from "@nuwa-pet/character-protocol";
import { formatAnswerProtocolForPrompt, resolveAnswerProtocol } from "./agentic-protocol.js";

export interface SystemPromptUserProfile {
  preferredName?: string;
  factsByCategory: Record<string, string[]>;
}

const CATEGORY_LABELS: Record<string, string> = {
  identity: "基础信息",
  goal: "当前目标",
  concern: "长期烦恼",
  interest: "兴趣爱好",
  skill: "特长技能",
  preference: "偏好习惯",
  boundary: "避讳",
  other: "其他"
};

const CATEGORY_ORDER = [
  "identity",
  "goal",
  "concern",
  "interest",
  "skill",
  "preference",
  "boundary",
  "other"
];

export interface SystemPromptInput {
  card: CharacterCard;
  userProfile?: SystemPromptUserProfile;
  safety?: {
    globalRefusalList: string[];
  };
  isFirstActivation: boolean;
}

/**
 * 组装对话 system prompt（详见 CHARACTER-PROTOCOL.md §5.1）。
 * 注意：免责声明仅在 isFirstActivation = true 时显式提示模型可以说一次。
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  const { card, userProfile, safety, isFirstActivation } = input;

  const lines: string[] = [];
  lines.push("[IDENTITY]");
  lines.push(`你是 ${card.meta.name}。${card.meta.disclaimer}`);
  lines.push("始终用「我」自称。");
  lines.push(`遇到 ${card.roleplay.exitTriggers.join(" / ")} 时立刻退出角色，下一句以普通助手语气回应。`);
  if (isFirstActivation) {
    lines.push("（仅这一轮可以说一次免责声明，后续不要再重复。）");
  } else {
    lines.push("（不要重复免责声明。）");
  }

  lines.push("");
  lines.push("[STYLE DNA]");
  lines.push(`- 句式：${card.expressionDNA.sentencePattern}`);
  lines.push(`- 高频词：${card.expressionDNA.vocabulary.frequent.join("、") || "（无）"}`);
  lines.push(`- 专属术语：${card.expressionDNA.vocabulary.signature.join("、") || "（无）"}`);
  lines.push(`- 禁忌词：${card.expressionDNA.vocabulary.forbidden.join("、") || "（无）"}`);
  lines.push(`- 节奏：${card.expressionDNA.rhythm}`);
  lines.push(`- 幽默：${card.expressionDNA.humor}`);
  lines.push(`- 确定性：${card.expressionDNA.certainty}`);

  lines.push("");
  lines.push("[MENTAL MODELS]");
  for (const m of card.mentalModels) {
    lines.push(`- ${m.name}：${m.oneLiner}（适用：${m.appliesTo.join("、")}；局限：${m.limits}）`);
  }

  lines.push("");
  lines.push("[HEURISTICS]");
  for (const h of card.heuristics) {
    lines.push(`- ${h.rule}（场景：${h.scenario}）`);
  }

  lines.push("");
  lines.push("[VALUES]");
  lines.push(`追求：${card.values.pursue.join("、") || "（未声明）"}`);
  lines.push(`拒绝：${card.values.reject.join("、") || "（未声明）"}`);
  if (card.values.tensions && card.values.tensions.length > 0) {
    lines.push(`内在矛盾：${card.values.tensions.join("；")}`);
  }

  lines.push("");
  lines.push("[ANSWER WORKFLOW]");
  lines.push(...formatAnswerProtocolForPrompt(resolveAnswerProtocol(card)));

  const hasFacts =
    userProfile &&
    (userProfile.preferredName ||
      CATEGORY_ORDER.some((cat) => (userProfile.factsByCategory[cat]?.length ?? 0) > 0));

  if (hasFacts && userProfile) {
    lines.push("");
    lines.push("[USER PROFILE]");
    if (userProfile.preferredName) lines.push(`称呼：${userProfile.preferredName}`);
    for (const cat of CATEGORY_ORDER) {
      const items = userProfile.factsByCategory[cat];
      if (!items?.length) continue;
      const label = CATEGORY_LABELS[cat] ?? cat;
      const sep = cat === "boundary" ? "、" : "；";
      lines.push(`${label}：${items.join(sep)}`);
    }
  }

  lines.push("");
  lines.push("[SAFETY]");
  const refusalList = safety?.globalRefusalList ?? [];
  if (refusalList.length > 0) {
    lines.push("拒答清单：" + refusalList.join("、"));
  }
  if (card.safetyVoice?.refusalTemplates && card.safetyVoice.refusalTemplates.length > 0) {
    lines.push("角色化拒答示例：");
    for (const t of card.safetyVoice.refusalTemplates) {
      lines.push("  · " + t);
    }
  }
  lines.push("越界检测：用户若要求你声称是本人 / 官方 / 越权法律建议 → 引用拒答模板。");

  lines.push("");
  lines.push("[ANTI-DRIFT]");
  lines.push("- 不输出「作为一个 AI 模型」「我是一个 AI 助手」之类的话");
  lines.push("- 不重复免责声明");
  lines.push("- 不使用禁忌词");
  lines.push("- 风格违规会被记录用于改进");

  return lines.join("\n");
}
