/**
 * 桌面主进程把已通过本地校验的反馈 POST 到 Cloudflare ingest Worker。
 *
 * 组装 multipart（正文、版本、可选邮箱、图片附件），带超时与 User-Agent。
 * 本文件不校验载荷（调用方须先走 `validate-feedback`）；失败映射为 IPC 稳定错误码，
 * 超时视为 `upstream`，网络异常视为 `offline`。测试可注入 `fetchImpl` / `url`。
 */
import type { FeedbackSubmitResult } from "../../shared/ipc-contract.js";
import type { ValidatedFeedback } from "./validate-feedback.js";

/** 生产环境 ingest Worker 入口；测试与本地可被 `submitFeedbackToIngest` 的 `url` 覆盖。 */
export const FEEDBACK_INGEST_URL = "https://bailin-feedback.1969295061.workers.dev/v1/feedback";

/** 默认请求超时；超时后 `AbortController` 中止，映射为 `upstream`。 */
const DEFAULT_TIMEOUT_MS = 30_000;
/** 无法从响应读出可用 `message` 时的兜底文案。 */
const FALLBACK_ERROR = "发送失败，请稍后再试";

/**
 * 把 HTTP 状态码收成 IPC 失败码。
 * 429 / 413 / 400 与 Worker 约定对齐；其余（含 5xx、超时后的非标准码）一律 `upstream`。
 */
function codeForStatus(
  status: number
): "invalid" | "too_large" | "rate_limited" | "upstream" {
  if (status === 429) return "rate_limited";
  if (status === 413) return "too_large";
  if (status === 400) return "invalid";
  return "upstream";
}

/**
 * 从 JSON 响应取出可展示的 `message`；非对象、缺字段或空白则用兜底文案。
 * 超过 200 字截断，避免 Worker 长错误撑爆 toast。
 */
function readMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return FALLBACK_ERROR;
  const message = (payload as { message?: unknown }).message;
  if (typeof message !== "string" || !message.trim()) return FALLBACK_ERROR;
  const trimmed = message.trim();
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

/**
 * 把已校验的反馈发到 ingest Worker。
 *
 * 副作用：对 `url`（缺省为 `FEEDBACK_INGEST_URL`）发一次 POST。成功仅当 HTTP 成功
 * 且 JSON 含 `ok: true`。响应体不是 JSON 时按失败处理，不抛异常。
 *
 * @param options.url 可覆盖的 ingest 地址（测试用）
 * @param options.version 桌面应用版本，写入表单与 User-Agent
 * @param options.value 本地校验通过后的正文 / 邮箱 / 附件
 * @param options.fetchImpl 可注入的 `fetch`（测试替身）
 * @param options.timeoutMs 超时毫秒；缺省 30s
 * @returns IPC `FeedbackSubmitResult`；超时 `upstream`，其它网络错误 `offline`
 */
export async function submitFeedbackToIngest(options: {
  url?: string;
  version: string;
  value: ValidatedFeedback;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<FeedbackSubmitResult> {
  const form = new FormData();
  form.append("body", options.value.body);
  form.append("version", options.version);
  if (options.value.contact) form.append("contact", options.value.contact);
  for (const file of options.value.files) {
    form.append("files", new Blob([file.bytes], { type: file.mime }), file.name);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await options.fetchImpl(options.url ?? FEEDBACK_INGEST_URL, {
      method: "POST",
      body: form,
      headers: { "User-Agent": `Bailin-Desktop-Feedback/${options.version}` },
      signal: controller.signal
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      // 非 JSON 或空 body：不当成成功，后面按状态码失败
      payload = null;
    }

    if (res.ok && payload && typeof payload === "object" && (payload as { ok?: unknown }).ok === true) {
      return { ok: true };
    }

    return {
      ok: false,
      code: codeForStatus(res.status),
      error: readMessage(payload)
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    // 超时 abort 与断网要分开：前者是服务端/链路慢，后者才提示离线
    if (name === "AbortError") {
      return { ok: false, code: "upstream", error: FALLBACK_ERROR };
    }
    return { ok: false, code: "offline", error: FALLBACK_ERROR };
  } finally {
    clearTimeout(timer);
  }
}
