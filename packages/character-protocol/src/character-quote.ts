const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN_RE = /[A-Za-z]/;
const KANA_RE = /[\u3040-\u309f\u30a0-\u30ff]/;
const HANGUL_RE = /[\uac00-\ud7af]/;
const BILINGUAL_QUOTE_RE = /^(.+?)（([^）]+)）$/;

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

/**
 * 判断是否需要专项座右铭检索。
 * 公众人物 / 虚构角色：始终检索；原创角色：仅在缺失或无效时检索。
 */
export function needsQuoteLookup(
  quote: string | undefined,
  sourceType: "public-figure" | "fictional" | "original",
  _options?: { chineseNative?: boolean }
): boolean {
  if (sourceType === "public-figure" || sourceType === "fictional") {
    return true;
  }
  return !quote?.trim();
}

/** 华人角色：英文名是拼音转写而非独立艺名时，座右铭用纯中文。 */
export function isChineseNativeForQuote(
  chineseName: string,
  englishName: string,
  pinyinEnglish: string
): boolean {
  if (!hasCjk(chineseName)) return false;
  return englishName.trim().toLowerCase() === pinyinEnglish.trim().toLowerCase();
}

export function normalizeQuoteOneLiner(value: string): string {
  return value.trim().replace(/^["「『]|["」』]$/g, "").trim();
}
