import type { WhisperScenarioKind } from "../../shared/proactive-companion.js";

/**
 * 主动陪伴「模板层」耳语：把环境信号映射成固定中文短句。
 *
 * LLM 层走 proactive-llm-whisper，不读这里的正文；`llm` 模板刻意留空，
 * 避免套上「XX小声说：」前缀。unlock / resume 文案相同，枚举仍分开，
 * 便于场景开关与统计。未知 kind 由 scenarioFromSignal 返回 null。
 */

const TEMPLATES: Record<WhisperScenarioKind, string> = {
  long_active: "已经看了 {{minutes}} 分钟电脑了，起来伸个懒腰吧~",
  idle: "你停了好一会儿。卡住的话，我可以陪你拆一下。",
  active: "回来啦。刚才那段要继续吗？",
  unlock: "欢迎回来，先慢慢接上节奏。",
  resume: "欢迎回来，先慢慢接上节奏。",
  manual: "在这儿呢，想聊哪件事？",
  llm: ""
};

/**
 * 用场景模板拼一句可展示的耳语。
 *
 * @param scenario 已识别的陪伴场景
 * @param vars.name 角色显示名，非 llm 场景会加在「小声说：」前
 * @param vars.minutes 仅 long_active 等模板用到；缺省当 0
 * @returns 耳语正文；无副作用、不读设置、不打 IPC
 */
export function renderWhisperTemplate(
  scenario: WhisperScenarioKind,
  vars: { name: string; minutes?: number }
): string {
  const tpl = TEMPLATES[scenario] ?? TEMPLATES.manual;
  const body = tpl
    .replace(/\{\{minutes\}\}/g, String(vars.minutes ?? 0))
    .replace(/\{\{name\}\}/g, vars.name);
  // llm 正文由上游生成；空模板 + 提前返回，避免套上「XX小声说：」
  if (scenario === "llm") return body;
  return `${vars.name}小声说：${body}`;
}

/**
 * 把环境监视器 / 手动触发的 signal.kind 收窄成模板场景。
 *
 * @param kind 原始信号字符串，未必是 WhisperScenarioKind
 * @returns 已知场景；未知 kind 返回 null（调用方应视为 unknown-scenario，不要硬套 manual）
 */
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
