export interface CopyToClipboardOptions {
  /** 复制成功回调（如 showToast({ kind: "success" })）。 */
  onSuccess?: () => void;
  /**
   * 复制失败回调（如 showToast({ kind: "error" })）。
   * 不传时仅在 console 警告，不打扰用户。
   */
  onFailure?: (error: unknown) => void;
}

/**
 * 安全复制到剪贴板，带降级与显式错误：
 * 1. 优先 navigator.clipboard.writeText（需要 secure context；Electron preload OK）
 * 2. 失败时降级到 document.execCommand('copy') + 临时 textarea
 * 3. 双重失败时调 onFailure
 *
 * 解决场景：
 * - 非 secure context（file:// 偶发 / Win 某些安全策略）下 navigator.clipboard 抛错
 * - Chat 之前用 .then 不带 .catch，会出现 "假成功 toast"（silent data loss bug）
 *
 * @returns Promise<boolean> 是否复制成功；调用方可据此做后续 UI 动作。
 */
export async function copyToClipboard(
  text: string,
  options?: CopyToClipboardOptions
): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      options?.onSuccess?.();
      return true;
    } catch (err) {
      if (legacyCopy(text)) {
        options?.onSuccess?.();
        return true;
      }
      reportFailure(err, options);
      return false;
    }
  }

  try {
    if (legacyCopy(text)) {
      options?.onSuccess?.();
      return true;
    }
    reportFailure(new Error("Clipboard copy not supported in this environment"), options);
    return false;
  } catch (err) {
    reportFailure(err, options);
    return false;
  }
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  const previousSelection = saveSelection();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
    restoreSelection(previousSelection);
  }
  return ok;
}

function saveSelection(): Range | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0).cloneRange();
}

function restoreSelection(range: Range | null): void {
  if (!range) return;
  const sel = document.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function reportFailure(err: unknown, options?: CopyToClipboardOptions): void {
  if (options?.onFailure) {
    options.onFailure(err);
  } else {
    console.warn("[copyToClipboard] failed:", err);
  }
}
