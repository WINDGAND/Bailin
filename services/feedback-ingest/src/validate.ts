export const FEEDBACK_BODY_MIN = 8;
export const FEEDBACK_BODY_MAX = 4000;
export const FEEDBACK_CONTACT_MAX = 200;
export const FEEDBACK_MAX_FILES = 3;
export const FEEDBACK_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type FeedbackAllowedMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface IngestFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface ValidatedIngest {
  body: string;
  contact?: string;
  version: string;
  files: IngestFile[];
}

function isFeedbackEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function sniffImageMime(bytes: Uint8Array): FeedbackAllowedMime | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
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

export function validateIngestPayload(input: {
  body: unknown;
  contact?: unknown;
  version: unknown;
  files: IngestFile[];
}):
  | { ok: true; value: ValidatedIngest }
  | { ok: false; status: 400 | 413; code: "invalid" | "too_large"; message: string } {
  if (typeof input.version !== "string" || !input.version.trim()) {
    return { ok: false, status: 400, code: "invalid", message: "缺少版本号" };
  }
  if (typeof input.body !== "string") {
    return { ok: false, status: 400, code: "invalid", message: "正文太短或太长" };
  }
  const body = input.body.trim();
  if (body.length < FEEDBACK_BODY_MIN || body.length > FEEDBACK_BODY_MAX) {
    return { ok: false, status: 400, code: "invalid", message: "正文太短或太长" };
  }

  let contact: string | undefined;
  if (input.contact !== undefined && input.contact !== null && input.contact !== "") {
    if (typeof input.contact !== "string") {
      return { ok: false, status: 400, code: "invalid", message: "联系方式无效" };
    }
    const trimmed = input.contact.trim();
    if (trimmed.length > FEEDBACK_CONTACT_MAX) {
      return { ok: false, status: 400, code: "invalid", message: "联系方式过长" };
    }
    if (trimmed.length > 0) {
      if (!isFeedbackEmail(trimmed)) {
        return { ok: false, status: 400, code: "invalid", message: "请填写正确的邮箱" };
      }
      contact = trimmed;
    }
  }

  if (input.files.length > FEEDBACK_MAX_FILES) {
    return { ok: false, status: 400, code: "invalid", message: "附件不是支持的图片" };
  }
  for (const file of input.files) {
    if (file.bytes.byteLength > FEEDBACK_MAX_FILE_BYTES) {
      return { ok: false, status: 413, code: "too_large", message: "附件过大" };
    }
    const sniffed = sniffImageMime(file.bytes);
    if (!sniffed || sniffed !== file.mime) {
      return { ok: false, status: 400, code: "invalid", message: "附件不是支持的图片" };
    }
  }

  return {
    ok: true,
    value: contact
      ? { body, contact, version: input.version.trim(), files: input.files }
      : { body, version: input.version.trim(), files: input.files }
  };
}
