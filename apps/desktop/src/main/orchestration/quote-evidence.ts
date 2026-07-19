/**
 * 台词证据闸门（evidence gate）：纯函数校验一次台词解析结果是否可信，
 * 不含任何 LLM 调用。用于修复"格式正确但归属错误"的台词——
 * 比如把其它作品/同名角色的台词错配给目标角色（塔兹米 bad case）。
 *
 * 校验规则：
 *   1. quoteOneLiner 必须非空。
 *   2. original 角色没有外部证据可核对，只要求台词非空即可通过。
 *   3. 非 original 角色必须提供 speaker，且 speaker 要模糊匹配目标角色的中/英文名。
 *   4. 若身份契约给出了 sourceContext，work 字段必须模糊匹配该出处。
 *   5. 若给出了 sourceUrl，必须能在本次调用实际返回的 citations 里找到（否则视为编造）。
 */

export interface QuoteEvidenceCandidate {
  quoteOneLiner: string;
  speaker?: string;
  work?: string;
  sourceUrl?: string;
}

export interface QuoteEvidenceCheckInput {
  candidate: QuoteEvidenceCandidate;
  chineseName: string;
  englishName?: string;
  sourceContext?: string;
  /** 本次 LLM 调用实际返回的引用 URL 列表（非模型自称，而是工具调用真正给出的）。 */
  citations: string[];
  sourceType: "public-figure" | "fictional" | "original";
}

export interface QuoteEvidenceCheckResult {
  ok: boolean;
  reasons: string[];
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s·.\-_,，。！!?？"'“”‘’「」『』()（）]/g, "");
}

function fuzzyContains(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function fuzzyUrlMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function checkQuoteEvidence(input: QuoteEvidenceCheckInput): QuoteEvidenceCheckResult {
  const { candidate, chineseName, englishName, sourceContext, citations, sourceType } = input;
  const reasons: string[] = [];

  const quoteOneLiner = candidate.quoteOneLiner.trim();
  if (!quoteOneLiner) {
    return { ok: false, reasons: ["quoteOneLiner 为空"] };
  }

  if (sourceType === "original") {
    // 原创角色的台词是人格提炼产出，没有外部原文可核对；只要求非空。
    return { ok: true, reasons: [] };
  }

  const speaker = candidate.speaker?.trim() ?? "";
  if (!speaker) {
    reasons.push("speaker 缺失，无法核验台词是否出自目标角色本人");
  } else {
    const speakerMatches =
      fuzzyContains(speaker, chineseName) ||
      (englishName ? fuzzyContains(speaker, englishName) : false);
    if (!speakerMatches) {
      reasons.push(
        `speaker「${speaker}」与目标角色「${chineseName}${englishName ? `/${englishName}` : ""}」不匹配，疑似归属到了同名其它角色`
      );
    }
  }

  if (sourceContext) {
    const work = candidate.work?.trim() ?? "";
    if (!work) {
      reasons.push(`work 缺失，无法核验台词是否出自出处「${sourceContext}」`);
    } else if (!fuzzyContains(work, sourceContext)) {
      reasons.push(`work「${work}」与出处锚点「${sourceContext}」不匹配`);
    }
  }

  const sourceUrl = candidate.sourceUrl?.trim() ?? "";
  if (sourceUrl) {
    const verified = citations.some((c) => fuzzyUrlMatch(c, sourceUrl));
    if (!verified) {
      reasons.push(`sourceUrl「${sourceUrl}」未出现在本次实际检索引用中，疑似编造来源`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
