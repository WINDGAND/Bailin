/**
 * 反馈接入 Worker 的载荷校验：核对正文、可选邮箱、附件数量/体积，并用文件头魔数识别图片。
 *
 * 在 handler 把 multipart 交给飞书投递之前执行；纯函数、无 I/O、不发网络。
 * 声明 MIME 必须与魔数一致，防止把非图片或改后缀文件当截图上传。
 * 与桌面主进程 `validate-feedback.ts` 共用同一套长度与体积上限。
 */

/** 正文去空白后的最短字数；更短视为无效。 */
export const FEEDBACK_BODY_MIN = 8;
/** 正文去空白后的最长字数；更长视为无效。 */
export const FEEDBACK_BODY_MAX = 4000;
/** 联系邮箱去空白后的最长字符数。 */
export const FEEDBACK_CONTACT_MAX = 200;
/** 单次提交允许的图片附件上限。 */
export const FEEDBACK_MAX_FILES = 3;
/** 单个附件体积上限（5 MiB）；超限返回 `too_large` / 413。 */
export const FEEDBACK_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 允许的图片 MIME；须与 `sniffImageMime` 识别结果一致。 */
export type FeedbackAllowedMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** multipart 解析后的附件；`bytes` 为原始文件内容。 */
export interface IngestFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

/**
 * 校验通过后的接入载荷。
 * `contact` 仅在用户填写了合法邮箱时出现，空串会被省略。
 */
export interface ValidatedIngest {
  body: string;
  contact?: string;
  version: string;
  files: IngestFile[];
}

/** 粗校验联系邮箱形态；与桌面端 `isFeedbackEmail` 规则一致。 */
function isFeedbackEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * 按文件头魔数识别 JPEG / PNG / GIF / WebP，不信任调用方声明的 MIME。
 *
 * @param bytes 附件原始字节；过短或无法匹配时返回 `null`
 * @returns 识别到的允许 MIME，或 `null`
 */
export function sniffImageMime(bytes: Uint8Array): FeedbackAllowedMime | null {
  // JPEG：SOI 标记 FF D8
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
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
 * 校验接入 Worker 收到的反馈字段，产出可投递载荷或错误码。
 *
 * 体积超限返回 413 / `too_large`；其余字段问题一律 400 / `invalid`。
 * 附件必须同时满足数量、体积、魔数与声明 MIME 一致。
 *
 * @param input 正文、可选联系方式、应用版本、已解析的附件
 * @returns 成功带 `value`；失败带 HTTP 状态、错误码与中文短句。无副作用
 */
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
    // 魔数对不上、或与 multipart 声明的 MIME 不一致，一律当非法图片
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
