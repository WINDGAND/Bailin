export const FEEDBACK_BODY_MIN = 8;
export const FEEDBACK_BODY_MAX = 4000;
export const FEEDBACK_CONTACT_MAX = 200;
export const FEEDBACK_MAX_FILES = 3;
export const FEEDBACK_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export type FeedbackAllowedMime = (typeof FEEDBACK_ALLOWED_MIMES)[number];

export interface FeedbackFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export type ValidatedFeedback = {
  body: string;
  contact?: string;
  files: FeedbackFile[];
};

export function sniffImageMime(bytes: Uint8Array): FeedbackAllowedMime | null {
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
    if (trimmed.length > 0) contact = trimmed;
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
