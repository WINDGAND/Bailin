import type { WhisperScenarioKind } from "../../shared/proactive-companion.js";

const TEMPLATES: Record<WhisperScenarioKind, string> = {
  long_active: "已经看了 {{minutes}} 分钟电脑了，起来伸个懒腰吧~",
  idle: "你停了好一会儿。卡住的话，我可以陪你拆一下。",
  active: "回来啦。刚才那段要继续吗？",
  unlock: "欢迎回来，先慢慢接上节奏。",
  resume: "欢迎回来，先慢慢接上节奏。",
  manual: "在这儿呢，想聊哪件事？",
  llm: ""
};

export function renderWhisperTemplate(
  scenario: WhisperScenarioKind,
  vars: { name: string; minutes?: number }
): string {
  const tpl = TEMPLATES[scenario] ?? TEMPLATES.manual;
  const body = tpl
    .replace(/\{\{minutes\}\}/g, String(vars.minutes ?? 0))
    .replace(/\{\{name\}\}/g, vars.name);
  if (scenario === "llm") return body;
  return `${vars.name}小声说：${body}`;
}

export function scenarioFromSignal(
  kind: string
): WhisperScenarioKind | null {
  if (kind === "long_active") return "long_active";
  if (kind === "idle") return "idle";
  if (kind === "active") return "active";
  if (kind === "unlock" || kind === "resume") return kind as "unlock" | "resume";
  if (kind === "manual") return "manual";
  if (kind === "llm") return "llm";
  return null;
}
