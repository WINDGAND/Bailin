/**
 * 桌面主进程反馈提交前的本地校验。
 *
 * 在 IPC 把载荷交给 ingest Worker 之前，核对正文长度、可选邮箱、附件数量与体积，
 * 并用文件头魔数识别真实图片类型，拒绝「声明 MIME」与字节不一致的附件。
 * 纯函数、无 I/O、不发网络请求；`asBytes` 只负责把 IPC 传来的多种二进制形态收成 `Uint8Array`。
 */
import { isFeedbackEmail } from "../../shared/feedback-email.js";

/** 正文去空白后的最短字数；更短视为无效。 */
export const FEEDBACK_BODY_MIN = 8;
/** 正文去空白后的最长字数；更长视为无效。 */
export const FEEDBACK_BODY_MAX = 4000;
/** 联系邮箱去空白后的最长字符数。 */
export const FEEDBACK_CONTACT_MAX = 200;
/** 单次提交允许的图片附件上限。 */
export const FEEDBACK_MAX_FILES = 3;
/** 单个附件体积上限（5 MiB）；超限返回 `too_large`。 */
export const FEEDBACK_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** 允许的图片 MIME；须与 `sniffImageMime` 识别结果一致。 */
export const FEEDBACK_ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** `FEEDBACK_ALLOWED_MIMES` 中的单一 MIME。 */
export type FeedbackAllowedMime = (typeof FEEDBACK_ALLOWED_MIMES)[number];

/** 已通过魔数校验的附件；`bytes` 为原始文件内容。 */
export interface FeedbackFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

/**
 * 校验通过后的反馈载荷。
 * `contact` 仅在用户填写了合法邮箱时出现，空串会被省略。
 */
export type ValidatedFeedback = {
  body: string;
  contact?: string;
  files: FeedbackFile[];
};

/**
 * 按文件头魔数识别 JPEG / PNG / GIF / WebP，不信任调用方声明的 MIME。
 *
 * @param bytes 附件原始字节；过短或无法匹配时返回 `null`
 * @returns 识别到的允许 MIME，或 `null`
 */
export function sniffImageMime(bytes: Uint8Array): FeedbackAllowedMime | null {
  // JPEG：SOI 标记 FF D8
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP：RIFF....WEBP（偏移 4–7 为块长度，不参与匹配）
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * 把 IPC / Node 序列化后的二进制收成 `Uint8Array`。
 * 渲染进程经 structured clone 可能传来 `Uint8Array`、`ArrayBuffer`、TypedArray 视图，
 * 或 Node `Buffer` 的 JSON 形态 `{ type: "Buffer", data: number[] }`。
 */
function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (
    value &&
    typeof value === "object" &&
    (value as { type?: string }).type === "Buffer" &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return Uint8Array.from((value as { data: number[] }).data);
  }
  return null;
}

/**
 * 校验反馈表单输入：正文、可选邮箱、附件列表。
 *
 * 附件必须是数组且数量不超过上限；每个文件用魔数识别类型，且须与声明 `mime` 完全一致。
 * 体积超限单独返回 `too_large`，其余格式问题一律 `invalid`（错误文案对用户可见）。
 *
 * @param input `body` / `contact` / `files` 来自 IPC，类型未定
 * @returns 成功带规范化后的 `value`；失败带 `code` 与中文 `error`。无副作用
 */
export function validateFeedbackInput(input: {
  body: unknown;
  contact?: unknown;
  files: unknown;
}): { ok: true; value: ValidatedFeedback } | { ok: false; code: "invalid" | "too_large"; error: string } {
  if (typeof input.body !== "string") {
    return { ok: false, code: "invalid", error: "正文太短或太长" };
  }
  const body = input.body.trim();
  if (body.length < FEEDBACK_BODY_MIN || body.length > FEEDBACK_BODY_MAX) {
    return { ok: false, code: "invalid", error: "正文太短或太长" };
  }

  let contact: string | undefined;
  if (input.contact !== undefined && input.contact !== null) {
    if (typeof input.contact !== "string") {
      return { ok: false, code: "invalid", error: "联系方式无效" };
    }
    const trimmed = input.contact.trim();
    if (trimmed.length > FEEDBACK_CONTACT_MAX) {
      return { ok: false, code: "invalid", error: "联系方式过长" };
    }
    if (trimmed.length > 0) {
      if (!isFeedbackEmail(trimmed)) {
        return { ok: false, code: "invalid", error: "请填写正确的邮箱" };
      }
      contact = trimmed;
    }
  }

  if (!Array.isArray(input.files)) {
    return { ok: false, code: "invalid", error: "附件不是支持的图片" };
  }
  if (input.files.length > FEEDBACK_MAX_FILES) {
    return { ok: false, code: "invalid", error: "附件不是支持的图片" };
  }

  const files: FeedbackFile[] = [];
  for (const raw of input.files) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, code: "invalid", error: "附件不是支持的图片" };
    }
    const name = (raw as { name?: unknown }).name;
    const mime = (raw as { mime?: unknown }).mime;
    const bytes = asBytes((raw as { bytes?: unknown }).bytes);
    if (typeof name !== "string" || typeof mime !== "string" || !bytes) {
      return { ok: false, code: "invalid", error: "附件不是支持的图片" };
    }
    if (bytes.byteLength > FEEDBACK_MAX_FILE_BYTES) {
      return { ok: false, code: "too_large", error: "附件过大" };
    }
    const sniffed = sniffImageMime(bytes);
    if (!sniffed || sniffed !== mime) {
      return { ok: false, code: "invalid", error: "附件不是支持的图片" };
    }
    files.push({ name, mime, bytes });
  }

  return contact ? { ok: true, value: { body, contact, files } } : { ok: true, value: { body, files } };
}
