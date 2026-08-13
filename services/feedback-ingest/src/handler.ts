import { sendToFeishu } from "./feishu.js";
import { validateIngestPayload, type IngestFile } from "./validate.js";

export interface IngestEnv {
  FEEDBACK_KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_CHAT_ID: string;
}

const RATE_LIMIT = 5;

function json(
  status: number,
  body: { ok: true } | { ok: false; code: string; message: string }
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function hourKey(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}`;
}

async function filesFromForm(form: FormData): Promise<IngestFile[]> {
  const out: IngestFile[] = [];
  for (const entry of form.getAll("files")) {
    if (typeof entry === "string") continue;
    const bytes = new Uint8Array(await entry.arrayBuffer());
    out.push({
      name: entry.name || "file",
      mime: entry.type || "application/octet-stream",
      bytes
    });
  }
  return out;
}

export async function handleFeedback(
  request: Request,
  env: IngestEnv,
  options?: { fetchImpl?: typeof fetch; now?: Date; ip?: string }
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/v1/feedback") {
    return json(404, { ok: false, code: "invalid", message: "not found" });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, code: "invalid", message: "正文太短或太长" });
  }

  const files = await filesFromForm(form);
  const validated = validateIngestPayload({
    body: form.get("body"),
    contact: form.get("contact") ?? undefined,
    version: form.get("version"),
    files
  });
  if (!validated.ok) {
    return json(validated.status, { ok: false, code: validated.code, message: validated.message });
  }

  const now = options?.now ?? new Date();
  const ip = options?.ip ?? request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rlKey = `rl:${ip}:${hourKey(now)}`;

  let count = 0;
  try {
    const raw = await env.FEEDBACK_KV.get(rlKey);
    count = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(count) || count < 0) count = 0;
  } catch {
    return json(502, { ok: false, code: "upstream", message: "发送失败，请稍后再试" });
  }
  if (count >= RATE_LIMIT) {
    return json(429, { ok: false, code: "rate_limited", message: "刚才已经收过了，请稍后再试" });
  }
  try {
    await env.FEEDBACK_KV.put(rlKey, String(count + 1));
  } catch {
    return json(502, { ok: false, code: "upstream", message: "发送失败，请稍后再试" });
  }

  try {
    await sendToFeishu(
      env,
      {
        version: validated.value.version,
        contact: validated.value.contact,
        body: validated.value.body,
        files: validated.value.files
      },
      options?.fetchImpl ?? fetch
    );
  } catch {
    return json(502, { ok: false, code: "upstream", message: "发送失败，请稍后再试" });
  }

  return json(200, { ok: true });
}
