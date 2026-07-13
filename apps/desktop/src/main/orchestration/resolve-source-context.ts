/**
 * 创建角色「出处 / 身份」消歧义锚点优先级（纯函数，无 LLM）。
 *
 * 1. 显式 sourceContext（用户表单填写）
 * 2. 从 userHint / userMaterial 抠《XX》或括号
 * 3. original → none；其它 → needs_llm（由调用方做「最广为人知」猜测）
 */

export const MAX_SOURCE_CONTEXT = 40;

export type SourceContextPriorityResult =
  | { kind: "explicit"; sourceContext: string }
  | { kind: "hint"; sourceContext: string }
  | { kind: "needs_llm" }
  | { kind: "none" };

export interface SourceContextPriorityInput {
  sourceContext?: string;
  userHint?: string;
  userMaterial?: string;
  sourceType: "public-figure" | "fictional" | "original";
}

function normalizeSourceContext(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  return t.slice(0, MAX_SOURCE_CONTEXT);
}

/** 从补充文本里抠《作品》或括号上下文。 */
export function extractSourceContextFromText(extra: string): string | undefined {
  const sliced = extra.slice(0, 600);
  const m1 = sliced.match(/[《<【](.+?)[》>】]/);
  const hintWork = m1?.[1]?.trim();
  if (hintWork && hintWork.length <= MAX_SOURCE_CONTEXT) {
    return hintWork;
  }
  const m2 = sliced.match(/\(([^)]+)\)|（([^）]+)）/);
  const parenHint = m2?.[1]?.trim() ?? m2?.[2]?.trim();
  if (parenHint && parenHint.length <= MAX_SOURCE_CONTEXT) {
    return parenHint;
  }
  return undefined;
}

export function resolveSourceContextPriority(
  input: SourceContextPriorityInput
): SourceContextPriorityResult {
  const explicit = normalizeSourceContext(input.sourceContext);
  if (explicit) {
    return { kind: "explicit", sourceContext: explicit };
  }

  const extra = `${input.userHint ?? ""}\n${input.userMaterial ?? ""}`;
  const fromHint = extractSourceContextFromText(extra);
  if (fromHint) {
    return { kind: "hint", sourceContext: fromHint };
  }

  if (input.sourceType === "original") {
    return { kind: "none" };
  }

  return { kind: "needs_llm" };
}
