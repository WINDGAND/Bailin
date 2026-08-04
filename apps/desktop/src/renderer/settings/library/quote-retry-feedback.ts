/**
 * 座右铭「重新核实」结果 → 用户可见反馈。
 * 抽成纯函数，避免 UI 只依赖角落 toast / 漏看 quoteStatus 字段。
 */

export type QuoteRetryOutcome =
  | { kind: "verified" }
  | { kind: "unverified" }
  | { kind: "error"; error: string };

export interface QuoteRetryResponse {
  ok: boolean;
  quoteStatus?: "verified" | "provisional" | "missing";
  error?: string;
}

/**
 * 解释 regenerateQuote 的 IPC 返回值。
 *
 * - ok / quoteStatus=verified → 成功
 * - provisional / missing → 仍未核实（签名可能不变，但必须给反馈）
 * - 其它失败：有 error 文案则走 error；否则兜底为 unverified（避免静默）
 */
export function interpretQuoteRetryResult(r: QuoteRetryResponse): QuoteRetryOutcome {
  if (r.ok || r.quoteStatus === "verified") {
    return { kind: "verified" };
  }
  if (r.quoteStatus === "provisional" || r.quoteStatus === "missing") {
    return { kind: "unverified" };
  }
  if (r.error?.trim()) {
    return { kind: "error", error: r.error.trim() };
  }
  return { kind: "unverified" };
}
