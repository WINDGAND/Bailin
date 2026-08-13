import type { ValidatedFeedback } from "./validate-feedback.js";

export const FEEDBACK_INGEST_URL = "https://bailin-feedback.windgand.workers.dev/v1/feedback";

export type FeedbackSubmitResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid" | "too_large" | "rate_limited" | "offline" | "upstream";
      error: string;
    };

const DEFAULT_TIMEOUT_MS = 30_000;
const FALLBACK_ERROR = "发送失败，请稍后再试";

function codeForStatus(
  status: number
): "invalid" | "too_large" | "rate_limited" | "upstream" {
  if (status === 429) return "rate_limited";
  if (status === 413) return "too_large";
  if (status === 400) return "invalid";
  return "upstream";
}

function readMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return FALLBACK_ERROR;
  const message = (payload as { message?: unknown }).message;
  if (typeof message !== "string" || !message.trim()) return FALLBACK_ERROR;
  const trimmed = message.trim();
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

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
    if (name === "AbortError") {
      return { ok: false, code: "upstream", error: FALLBACK_ERROR };
    }
    return { ok: false, code: "offline", error: FALLBACK_ERROR };
  } finally {
    clearTimeout(timer);
  }
}
