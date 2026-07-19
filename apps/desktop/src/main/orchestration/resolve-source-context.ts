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

// ============================================================
// 复合角色输入拆分：把「斩赤红之瞳 男主角 塔兹米」这类一次性填在
// characterName 里的复合输入拆成 干净的 characterName + sourceContext + identityHint。
// 纯函数，无 LLM；只在识别到明显的复合模式时才拆分，避免误伤正常单一名字。
// ============================================================

const MAX_IDENTITY_NAME = 40;

/** 常见的「身份 / 角色定位」关键词，拆分后作为 identityHint 提示给下游 prompt。 */
const IDENTITY_ROLE_WORDS = [
  "男主角",
  "女主角",
  "男主",
  "女主",
  "男二号",
  "女二号",
  "男二",
  "女二",
  "第一人物",
  "第二人物",
  "主角",
  "反派",
  "配角",
  "男一号",
  "女一号"
];

/** 连接词填充，去掉后不影响语义，用于剥离「XX里面的/中的角色」这类表述。 */
const CONNECTOR_FILLERS = ["里面的", "里的", "之中的", "当中的", "中的"];

export interface CompoundIdentitySplitResult {
  /** 拆分后的干净角色名；未识别到复合模式时等于原始输入（trim 后）。 */
  characterName: string;
  /** 从复合输入中拆出的出处 / 作品锚点（如「斩赤红之瞳」）；未识别到则为空。 */
  sourceContext?: string;
  /** 从复合输入中拆出的身份 / 角色定位提示（如「男主角」）；未识别到则为空。 */
  identityHint?: string;
  /** 是否真的发生了拆分（characterName 是否被改写）。 */
  changed: boolean;
}

/**
 * 拆分复合角色输入。典型场景：
 *   "斩赤红之瞳 男主角 塔兹米" → { characterName: "塔兹米", sourceContext: "斩赤红之瞳", identityHint: "男主角" }
 *   "《进击的巨人》里面的男主角，艾伦" → { characterName: "艾伦", sourceContext: "进击的巨人", identityHint: "男主角" }
 *   "塔兹米" → { characterName: "塔兹米", changed: false }（正常单一名字不拆）
 *
 * 只在识别到《书名》/ 括号锚点，或角色定位关键词，或多个分隔符分隔的多段文本时才触发拆分，
 * 避免把正常的单一人名/艺名误拆。
 */
export function splitCompoundCharacterInput(raw: string): CompoundIdentitySplitResult {
  const original = raw.trim();
  if (!original) {
    return { characterName: original, changed: false };
  }

  let remainder = original;
  let sourceContext: string | undefined;

  // 1. 《作品》/ (作品) / （作品）锚点优先抽取
  const bracketMatch = original.match(/[《<【](.+?)[》>】]/);
  if (bracketMatch?.[1]) {
    const work = bracketMatch[1].trim();
    if (work.length > 0 && work.length <= MAX_IDENTITY_NAME) {
      sourceContext = work;
      remainder = remainder.replace(bracketMatch[0], " ");
    }
  } else {
    const parenMatch = original.match(/\(([^)]+)\)|（([^）]+)）/);
    const parenWork = parenMatch?.[1]?.trim() ?? parenMatch?.[2]?.trim();
    if (parenWork && parenWork.length <= MAX_IDENTITY_NAME) {
      sourceContext = parenWork;
      remainder = remainder.replace(parenMatch![0], " ");
    }
  }

  // 2. 身份 / 角色定位关键词
  let identityHint: string | undefined;
  for (const word of IDENTITY_ROLE_WORDS) {
    if (remainder.includes(word)) {
      identityHint = word;
      remainder = remainder.replace(word, " ");
      break;
    }
  }

  // 3. 去掉连接词填充
  for (const filler of CONNECTOR_FILLERS) {
    remainder = remainder.split(filler).join(" ");
  }

  // 4. 按常见分隔符拆分剩余 token
  const tokens = remainder
    .split(/[，,、\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { characterName: original, sourceContext, identityHint, changed: sourceContext != null };
  }

  // 只有识别到锚点/身份词，或原始输入本就由多个 token 组成时才认为是复合输入。
  const hadAnchor = sourceContext != null || identityHint != null;
  if (tokens.length === 1) {
    const name = tokens[0]!;
    const changed = hadAnchor && name !== original;
    return { characterName: changed ? name : original, sourceContext, identityHint, changed };
  }

  // 多个剩余 token：最后一个视为角色名，前面的拼接补充 sourceContext（若尚未拿到）。
  const name = tokens[tokens.length - 1]!;
  const leading = tokens.slice(0, -1).join(" ");
  if (!sourceContext && leading.length > 0 && leading.length <= MAX_IDENTITY_NAME) {
    sourceContext = leading;
  } else if (leading.length > 0 && !identityHint) {
    identityHint = leading.slice(0, MAX_IDENTITY_NAME);
  }

  if (name.length === 0 || name.length > MAX_IDENTITY_NAME || name === original) {
    return { characterName: original, sourceContext, identityHint, changed: sourceContext != null };
  }

  return { characterName: name, sourceContext, identityHint, changed: true };
}

// ============================================================
// 身份契约（CanonicalIdentity）：调研前解析一次，后续名称 / 调研 / 台词 /
// 搜图 / 外貌全部只消费这一个对象，不再各自从 config.characterName 里
// 重新猜测出处，避免出现"调研档案是对的，但命名/台词/搜图各自猜歧义猜错"的错位。
// ============================================================

export interface CanonicalIdentity {
  /** 用户原始输入（未拆分）。 */
  rawInput: string;
  /** 拆分/清洗后的干净角色名，用于后续所有 LLM 调用。 */
  characterName: string;
  /** 出处 / 身份锚点（作品、职业等），显式表单字段优先于从输入里拆出的锚点。 */
  sourceContext?: string;
  /** 身份定位提示（如「男主角」），仅来自复合输入拆分，无显式表单字段对应。 */
  identityHint?: string;
  /**
   * sourceContext 的置信度来源：
   *   - explicit：用户在表单里显式填写
   *   - hint：从复合角色名输入拆出（如「斩赤红之瞳 男主角 塔兹米」）
   *   - unresolved：两者都没有，需要调用方另行用 LLM 猜测「最广为人知」
   */
  sourceContextConfidence: "explicit" | "hint" | "unresolved";
}

/**
 * 纯函数：把「原始角色名输入 + 表单 sourceContext」解析成统一的身份契约对象。
 * 不含任何 LLM 调用——LLM 兜底猜测（needs_llm）仍由调用方在拿到
 * sourceContextConfidence="unresolved" 时自行触发一次调用并回填。
 */
export function buildCanonicalIdentityFromInput(input: {
  characterName: string;
  sourceContext?: string;
  sourceType: "public-figure" | "fictional" | "original";
}): CanonicalIdentity {
  const split = splitCompoundCharacterInput(input.characterName);
  const explicitSourceContext = normalizeSourceContext(input.sourceContext);

  if (explicitSourceContext) {
    return {
      rawInput: input.characterName,
      characterName: split.characterName,
      sourceContext: explicitSourceContext,
      identityHint: split.identityHint,
      sourceContextConfidence: "explicit"
    };
  }

  if (split.sourceContext) {
    return {
      rawInput: input.characterName,
      characterName: split.characterName,
      sourceContext: split.sourceContext,
      identityHint: split.identityHint,
      sourceContextConfidence: "hint"
    };
  }

  return {
    rawInput: input.characterName,
    characterName: split.characterName,
    identityHint: split.identityHint,
    sourceContextConfidence: "unresolved"
  };
}
