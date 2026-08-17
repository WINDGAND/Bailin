import { sendToFeishu } from "./feishu.js";
import { validateIngestPayload, type IngestFile } from "./validate.js";

/**
 * 反馈接入服务（feedback-ingest）的 HTTP 处理器。
 *
 * 该服务运行在 Cloudflare Workers 上（见 index.ts 中默认导出的 fetch 入口），
 * 职责是接收「百灵」桌面客户端提交的用户反馈（正文 + 联系方式 + 截图附件），
 * 经过以下流程后转发到飞书群：
 *
 *   1. 校验请求方法与路径（仅接受 POST /v1/feedback）；
 *   2. 解析 multipart 表单并抽取附件文件；
 *   3. 对正文、联系方式、附件进行业务校验（见 validate.ts）；
 *   4. 基于「来源 IP + 当前小时」做限流，防止单点恶意刷量；
 *   5. 调用飞书开放接口，将反馈以富文本消息（可带图片）推送到指定群。
 */

/**
 * Worker 运行时注入的环境变量契约。
 * FEEDBACK_KV 用于限流计数存储，三个 FEISHU_* 变量用于调用飞书开放接口。
 */
export interface IngestEnv {
  FEEDBACK_KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_CHAT_ID: string;
}

/** 每个「IP + 小时」窗口内允许提交的最大反馈次数，超出即返回 429。 */
const RATE_LIMIT = 5;

/**
 * 构造一个带 JSON 响应体的 HTTP 响应。
 * @param status  HTTP 状态码
 * @param body    响应体：成功时为 `{ ok: true }`，失败时携带错误码与提示语
 */
function json(
  status: number,
  body: { ok: true } | { ok: false; code: string; message: string }
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

/**
 * 生成限流键的时间段标识：形如 `YYYY-MM-DD-HH`，精确到小时。
 * 这样每个小时的限流计数彼此独立，避免用户被永久锁死。
 */
function hourKey(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}`;
}

/**
 * 从 multipart 表单中抽取 `files` 字段下的所有文件条目，
 * 统一转换为 `{ name, mime, bytes }` 结构，便于后续校验与上传。
 * 表单中的纯字符串条目（非文件）会被直接跳过。
 */
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

/**
 * 反馈接口的主入口。
 *
 * @param request Worker 收到的原始请求
 * @param env     运行时环境（KV + 飞书凭据）
 * @param options 可选依赖注入：自定义 fetch、当前时间、来源 IP，
 *                主要用于单元测试中隔离网络与时间等副作用。
 * @returns 始终返回一个 JSON Response，任何失败都会被转换为对应的状态码与提示。
 */
export async function handleFeedback(
  request: Request,
  env: IngestEnv,
  options?: { fetchImpl?: typeof fetch; now?: Date; ip?: string }
): Promise<Response> {
  // 仅接受 POST /v1/feedback，其余一律 404，避免暴露服务存在感。
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/v1/feedback") {
    return json(404, { ok: false, code: "invalid", message: "not found" });
  }

  // 解析表单；若请求体并非合法的 multipart 数据则返回 400。
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, code: "invalid", message: "正文太短或太长" });
  }

  // 抽取附件并做业务校验（正文长度、联系方式格式、附件类型/大小等）。
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

  // 确定当前时间与来源 IP；优先使用测试注入值，否则从请求头读取真实 IP。
  const now = options?.now ?? new Date();
  const ip = options?.ip ?? request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rlKey = `rl:${ip}:${hourKey(now)}`;

  // 读取当前小时该 IP 的已提交次数；KV 不可用时按上游故障返回 502。
  let count = 0;
  try {
    const raw = await env.FEEDBACK_KV.get(rlKey);
    count = raw ? Number.parseInt(raw, 10) : 0;
    if (!Number.isFinite(count) || count < 0) count = 0;
  } catch {
    return json(502, { ok: false, code: "upstream", message: "发送失败，请稍后再试" });
  }
  // 超过限流阈值则拒绝本次提交（429），防止刷屏与滥用。
  if (count >= RATE_LIMIT) {
    return json(429, { ok: false, code: "rate_limited", message: "刚才已经收过了，请稍后再试" });
  }
  // 先原子地递增计数再发送，尽可能避免并发请求绕过限流。
  try {
    await env.FEEDBACK_KV.put(rlKey, String(count + 1));
  } catch {
    return json(502, { ok: false, code: "upstream", message: "发送失败，请稍后再试" });
  }

  // 将反馈转发到飞书群；发送失败同样视为上游错误（502）。
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
