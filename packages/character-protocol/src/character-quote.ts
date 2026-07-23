import { looksLikeForeignTranslitWithoutDot } from "./character-names.js";

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN_RE = /[A-Za-z]/;
const KANA_RE = /[\u3040-\u309f\u30a0-\u30ff]/;
const HANGUL_RE = /[\uac00-\ud7af]/;
const BILINGUAL_QUOTE_RE = /^(.+?)（([^）]+)）$/;

const SKELETON_PLACEHOLDER_QUOTES = [
  "我还没准备好。",
  "I'm not ready yet.",
  "I am not ready yet."
] as const;

export type QuoteStatus = "verified" | "provisional" | "missing";

export function isSkeletonPlaceholderQuote(quote: string | undefined): boolean {
  const trimmed = quote?.trim();
  if (!trimmed) return false;
  return SKELETON_PLACEHOLDER_QUOTES.some(
    (s) => s.toLowerCase() === trimmed.toLowerCase()
  );
}

/** 去掉骨架占位后的有效原话；占位或空串视为无原话。 */
export function effectiveQuoteOneLiner(quote: string | undefined): string | undefined {
  const trimmed = quote?.trim();
  if (!trimmed || isSkeletonPlaceholderQuote(trimmed)) return undefined;
  return trimmed;
}

/** 人格卡里可顶上签名区的文案（标志性表达优先，其次自我介绍）。 */
export function pickProvisionalSignatureText(input: {
  signatureVocabulary?: string[];
  selfIntro?: string;
}): string | undefined {
  for (const value of input.signatureVocabulary ?? []) {
    const trimmed = value?.trim();
    if (trimmed && !isSkeletonPlaceholderQuote(trimmed)) return trimmed;
  }
  const intro = input.selfIntro?.trim();
  if (intro && !isSkeletonPlaceholderQuote(intro)) return intro;
  return undefined;
}

/**
 * 读侧 / 写回前推导 quoteStatus。
 * 已核验原话 → verified；否则有人格顶上 → provisional；否则 missing。
 */
export function deriveQuoteStatus(input: {
  quoteOneLiner?: string;
  quoteStatus?: QuoteStatus;
  signatureVocabulary?: string[];
  selfIntro?: string;
}): QuoteStatus {
  const quote = effectiveQuoteOneLiner(input.quoteOneLiner);
  if (quote && (input.quoteStatus === "verified" || input.quoteStatus == null)) {
    return "verified";
  }
  if (input.quoteStatus === "verified" && quote) return "verified";
  if (pickProvisionalSignatureText(input)) return "provisional";
  return "missing";
}

/** 清洗 meta 上的座右铭字段：清除占位句并补齐 quoteStatus。 */
export function coerceQuoteMeta(input: {
  quoteOneLiner?: string;
  quoteStatus?: QuoteStatus;
  quoteStatusReason?: string;
  signatureVocabulary?: string[];
  selfIntro?: string;
}): {
  quoteOneLiner?: string;
  quoteStatus: QuoteStatus;
  quoteStatusReason?: string;
} {
  const quoteOneLiner = effectiveQuoteOneLiner(input.quoteOneLiner);
  const quoteStatus = deriveQuoteStatus({
    quoteOneLiner,
    quoteStatus: input.quoteStatus,
    signatureVocabulary: input.signatureVocabulary,
    selfIntro: input.selfIntro
  });
  return {
    quoteOneLiner,
    quoteStatus,
    quoteStatusReason:
      quoteStatus === "verified" ? undefined : input.quoteStatusReason
  };
}

function hasCjk(value: string): boolean {
  return CJK_RE.test(value);
}

function cjkRatio(value: string): number {
  const chars = [...value.replace(/\s/g, "")];
  if (chars.length === 0) return 0;
  return chars.filter((ch) => CJK_RE.test(ch)).length / chars.length;
}

/** 座右铭主体与括号内译文是否都是中文（错误格式）。 */
export function isDuplicateChineseQuote(quote: string): boolean {
  const match = quote.trim().match(BILINGUAL_QUOTE_RE);
  if (!match) return false;
  const original = match[1]!.trim();
  const translation = match[2]!.trim();
  return cjkRatio(original) > 0.85 && cjkRatio(translation) > 0.85;
}

/** 非中文母语角色是否具备「外文 + 中文译」格式。 */
export function isValidForeignLanguageQuote(quote: string): boolean {
  const trimmed = quote.trim();
  if (!trimmed) return false;
  if (isDuplicateChineseQuote(trimmed)) return false;

  const match = trimmed.match(BILINGUAL_QUOTE_RE);
  if (!match) return false;

  const original = match[1]!.trim();
  const translation = match[2]!.trim();
  if (!original || !translation) return false;
  if (cjkRatio(translation) < 0.5) return false;

  const hasForeignScript =
    LATIN_RE.test(original) || KANA_RE.test(original) || HANGUL_RE.test(original);
  const originalMostlyChinese = cjkRatio(original) > 0.85;

  return hasForeignScript || !originalMostlyChinese;
}

/** 中文母语角色的纯中文座右铭。 */
export function isValidChineseNativeQuote(quote: string): boolean {
  const trimmed = quote.trim();
  if (!trimmed || !hasCjk(trimmed)) return false;
  if (BILINGUAL_QUOTE_RE.test(trimmed) && isDuplicateChineseQuote(trimmed)) return false;
  // 纯中文或「中文引号」形式，主体不应是大段英文
  if (LATIN_RE.test(trimmed) && cjkRatio(trimmed) < 0.4) return false;
  return true;
}

/** 当前座右铭是否已符合该角色的格式要求。 */
export function isQuoteAcceptable(
  quote: string | undefined,
  options: { chineseNative: boolean }
): boolean {
  const trimmed = quote?.trim();
  if (!trimmed) return false;
  return options.chineseNative
    ? isValidChineseNativeQuote(trimmed)
    : isValidForeignLanguageQuote(trimmed);
}

/**
 * 非中文母语角色的座右铭是否缺少中文译文（仅有日文/英文等原文）。
 */
export function needsQuoteTranslation(
  quote: string | undefined,
  options: { chineseNative: boolean }
): boolean {
  if (options.chineseNative) return false;
  const trimmed = quote?.trim();
  if (!trimmed) return false;
  if (isValidForeignLanguageQuote(trimmed)) return false;

  const hasForeignScript =
    LATIN_RE.test(trimmed) || KANA_RE.test(trimmed) || HANGUL_RE.test(trimmed);
  if (hasForeignScript) return true;

  // 整段非中文且没有「原文（中文）」格式
  if (!BILINGUAL_QUOTE_RE.test(trimmed) && cjkRatio(trimmed) < 0.5) return true;

  return false;
}

/**
 * 判断是否需要专项座右铭检索。
 * 已有且格式正确的座右铭会跳过；否则联网检索角色原话。
 */
export function needsQuoteLookup(
  quote: string | undefined,
  sourceType: "public-figure" | "fictional" | "original",
  options?: { chineseNative?: boolean }
): boolean {
  if (isSkeletonPlaceholderQuote(quote)) return true;
  const chineseNative = options?.chineseNative ?? false;
  if (!quote?.trim()) return true;
  return !isQuoteAcceptable(quote, { chineseNative });
}

/** 华人角色：英文名是拼音转写而非独立艺名时，座右铭用纯中文。 */
export function isChineseNativeForQuote(
  chineseName: string,
  englishName: string,
  pinyinEnglish: string,
  sourceType?: "public-figure" | "fictional" | "original"
): boolean {
  if (!hasCjk(chineseName)) return false;
  const isPinyin = englishName.trim().toLowerCase() === pinyinEnglish.trim().toLowerCase();
  if (!isPinyin) return false;
  // 拼音英文名 + 长无间隔号中文 → 实为外文角色误标，座右铭应「原文（中文）」
  if (
    (sourceType === "public-figure" || sourceType === "fictional") &&
    looksLikeForeignTranslitWithoutDot(chineseName)
  ) {
    return false;
  }
  return true;
}

export function normalizeQuoteOneLiner(value: string): string {
  return value.trim().replace(/^["「『]|["」』]$/g, "").trim();
}
