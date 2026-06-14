import type { LLMProviderConfig } from "../../shared/ipc-contract.js";

/**
 * 图像生成适配器：为 hatch-pet 主路径提供生图能力。
 *
 * 三档预设：economy / standard / premium。
 *   - economy   预览 / 失败重试；优先选 GPT Image Mini / FLUX Schnell 等低价模型
 *   - standard  默认；指令跟随稳定、质量与成本平衡（如 gpt-image / seedream lite）
 *   - premium   最终成品；纸面质量最高（如 nano-banana-pro / gpt-image high）
 *
 * 默认对接 OpenAI 兼容 Images API：
 *   POST /v1/images/generations
 *   POST /v1/images/edits   （multipart/form-data）
 * 其它生图聚合器（Atlas Cloud / fal / EvoLink / ohmygpt 等）也基本与此对齐。
 *
 * 适配器不强行下载图片：所有 `image` 输入都是 `data:image/...;base64,...` 字符串，
 * 调用方在 hatch-pet pipeline 中负责把生成结果转 buffer / 落盘。
 */

export type ImageTierName = "economy" | "standard" | "premium";

export interface ImageTierConfig {
  /** 模型 ID，由用户在 Settings 中配置；默认见 DEFAULT_IMAGE_TIERS。 */
  model: string;
  /** OpenAI Images API 的尺寸；非该协议的 provider 可忽略。 */
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  /**
   * 质量档。OpenAI gpt-image-* 用 low/medium/high；
   * 旧 DALL·E 用 standard/hd；其它 provider 不识别就忽略。
   */
  quality?: "low" | "medium" | "high" | "standard" | "hd";
  /** 仅用于 UI 显示成本估算（美元/张）。 */
  estimatedCostUsd?: number;
}

export interface ImageGenerationConfig {
  /** 若为 true，复用 LLM provider 的 baseUrl + apiKey，省一份配置。 */
  useLLMProvider: boolean;
  /** 自定义 baseUrl；useLLMProvider=false 时必填。 */
  baseUrl?: string;
  /** 自定义 apiKey；useLLMProvider=false 时必填。 */
  apiKey?: string;
  /** 三档预设。 */
  tiers: Record<ImageTierName, ImageTierConfig>;
  /** UI 推荐默认档位。 */
  defaultTier: ImageTierName;
}

/**
 * 出厂默认值：基于 [costgoat.com / openai-images](https://costgoat.com/pricing/openai-images)
 * 和 [explainx hatch-pet](https://explainx.ai/skills/openai/skills/hatch-pet) 的公开价格估算。
 * 用户可在 Settings 中改成本地中转商支持的任意模型名。
 */
export const DEFAULT_IMAGE_TIERS: Record<ImageTierName, ImageTierConfig> = {
  economy: {
    model: "gpt-image-1-mini",
    size: "1024x1024",
    quality: "low",
    estimatedCostUsd: 0.005
  },
  standard: {
    model: "gpt-image-1",
    size: "1024x1024",
    quality: "medium",
    estimatedCostUsd: 0.042
  },
  premium: {
    model: "gpt-image-1",
    size: "1024x1536",
    quality: "high",
    estimatedCostUsd: 0.25
  }
};

export const DEFAULT_IMAGE_GENERATION_CONFIG: ImageGenerationConfig = {
  useLLMProvider: true,
  tiers: DEFAULT_IMAGE_TIERS,
  defaultTier: "standard"
};

export interface ImageGenerationRequest {
  prompt: string;
  /** 经济/标准/精品；不传则用 config.defaultTier。 */
  tier?: ImageTierName;
  /** 透明背景，OpenAI gpt-image-* 支持；其它 provider 忽略。 */
  transparentBackground?: boolean;
  /** 覆盖 tier.size。 */
  size?: ImageTierConfig["size"];
  /** 覆盖 tier.quality。 */
  quality?: ImageTierConfig["quality"];
  /** 超时（毫秒），默认 120s。生图通常需要 5-30s。 */
  timeoutMs?: number;
}

export interface ImageEditRequest extends ImageGenerationRequest {
  /** 主输入图（base 立绘 / canonical base）。data:image/... 或 https://。 */
  images: string[];
  /** 可选 mask；目前 hatch-pet 不需要。 */
  mask?: string;
}

export interface ImageGenerationResult {
  kind: "done";
  /** PNG / WebP 字节流，PNG 优先（OpenAI 默认返回 PNG b64_json）。 */
  buffer: Buffer;
  /** 文件 MIME，例如 image/png / image/webp。 */
  mimeType: string;
  /** 实际使用的 tier。 */
  tier: ImageTierName;
  /** 实际使用的模型。 */
  model: string;
  /** 端到端耗时（毫秒）。 */
  durationMs: number;
  /** 估算成本（美元）；用于成本面板汇总。 */
  estimatedCostUsd?: number;
}

export interface ImageGenerationError {
  kind: "error";
  code: string;
  message: string;
  /** 端到端耗时，便于上层做超时统计。 */
  durationMs: number;
}

export type ImageGenerationResponse = ImageGenerationResult | ImageGenerationError;

/**
 * ImageGenerationAdapter：纯主进程使用。
 * 与 LLMAdapter 类似，构造时传入「读取当前配置」的 getter，方便用户在 Settings 改完即时生效。
 */
export class ImageGenerationAdapter {
  constructor(
    private readonly readConfig: () => ImageGenerationConfig | null,
    private readonly readLLMProvider: () => LLMProviderConfig | null
  ) {}

  /**
   * 当前 provider 是否准备好生图。
   * 用于 UI 在 hatch-pet 按钮上显示「未配置生图模型」灰色态。
   */
  detectCapability(): { ok: boolean; reason: string } {
    const resolved = this.resolveEndpoint();
    if (!resolved) {
      return {
        ok: false,
        reason: "未配置生图 Provider：请在设置中填写或勾选「复用 LLM Provider」"
      };
    }
    if (!resolved.apiKey) {
      return { ok: false, reason: "生图 Provider 缺少 API Key" };
    }
    return { ok: true, reason: `已就绪：${resolved.baseUrl}` };
  }

  /** 文本生图：用于 base 立绘 / 任何不需要参考输入的步骤。 */
  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const startedAt = Date.now();
    const resolved = this.resolveEndpoint();
    if (!resolved) {
      return errorResult("CONFIG_MISSING", "未配置生图 Provider", startedAt);
    }
    const config = this.config();
    const tierName = req.tier ?? config.defaultTier;
    const tier = config.tiers[tierName];
    const body: Record<string, unknown> = {
      model: tier.model,
      prompt: req.prompt,
      size: req.size ?? tier.size ?? "1024x1024",
      n: 1,
      response_format: "b64_json"
    };
    const quality = req.quality ?? tier.quality;
    if (quality) body.quality = quality;
    if (req.transparentBackground) body.background = "transparent";

    return this.postJsonAndDecodeImage(
      joinUrl(resolved.baseUrl, "images/generations"),
      resolved.apiKey,
      body,
      tierName,
      tier,
      req.timeoutMs ?? 120_000,
      startedAt
    );
  }

  /**
   * 编辑 / image-to-image。把 canonical base + layout guide + 参考图喂进去，
   * 让模型在保持身份的前提下绘制 row strip。
   *
   * OpenAI Images Edits 端点要求 multipart/form-data。
   */
  async edit(req: ImageEditRequest): Promise<ImageGenerationResponse> {
    const startedAt = Date.now();
    const resolved = this.resolveEndpoint();
    if (!resolved) {
      return errorResult("CONFIG_MISSING", "未配置生图 Provider", startedAt);
    }
    if (req.images.length === 0) {
      return errorResult("INPUT_MISSING", "edit 需要至少一张参考图", startedAt);
    }
    const config = this.config();
    const tierName = req.tier ?? config.defaultTier;
    const tier = config.tiers[tierName];

    const form = new FormData();
    form.set("model", tier.model);
    form.set("prompt", req.prompt);
    form.set("size", req.size ?? tier.size ?? "1024x1024");
    form.set("n", "1");
    form.set("response_format", "b64_json");
    const quality = req.quality ?? tier.quality;
    if (quality) form.set("quality", quality);
    if (req.transparentBackground) form.set("background", "transparent");

    // 把每张 image 转成 Blob（PNG 默认），按 image[0] / image[1] 上传
    for (let i = 0; i < req.images.length; i += 1) {
      const src = req.images[i];
      if (!src) continue;
      const blob = await dataUrlOrUrlToBlob(src);
      form.set(req.images.length === 1 ? "image" : `image[${i}]`, blob, `ref-${i}.png`);
    }
    if (req.mask) {
      const blob = await dataUrlOrUrlToBlob(req.mask);
      form.set("mask", blob, "mask.png");
    }

    return this.postFormAndDecodeImage(
      joinUrl(resolved.baseUrl, "images/edits"),
      resolved.apiKey,
      form,
      tierName,
      tier,
      req.timeoutMs ?? 180_000,
      startedAt
    );
  }

  /** 配置文件解析；缺失字段用默认填补。 */
  private config(): ImageGenerationConfig {
    return this.readConfig() ?? DEFAULT_IMAGE_GENERATION_CONFIG;
  }

  /** 拿到实际可用的 baseUrl + apiKey；返回 null 表示未配置。 */
  private resolveEndpoint(): { baseUrl: string; apiKey: string } | null {
    const cfg = this.config();
    if (cfg.useLLMProvider) {
      const llm = this.readLLMProvider();
      if (!llm) return null;
      return { baseUrl: llm.baseUrl, apiKey: llm.apiKey };
    }
    if (!cfg.baseUrl || !cfg.apiKey) return null;
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
  }

  private async postJsonAndDecodeImage(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
    tier: ImageTierName,
    tierCfg: ImageTierConfig,
    timeoutMs: number,
    startedAt: number
  ): Promise<ImageGenerationResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      return await this.decodeImageResponse(
        res,
        tier,
        tierCfg,
        startedAt
      );
    } catch (err) {
      return errorResult(
        controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        err instanceof Error ? err.message : String(err),
        startedAt
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async postFormAndDecodeImage(
    url: string,
    apiKey: string,
    form: FormData,
    tier: ImageTierName,
    tierCfg: ImageTierConfig,
    timeoutMs: number,
    startedAt: number
  ): Promise<ImageGenerationResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal
      });
      return await this.decodeImageResponse(res, tier, tierCfg, startedAt);
    } catch (err) {
      return errorResult(
        controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        err instanceof Error ? err.message : String(err),
        startedAt
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async decodeImageResponse(
    res: Response,
    tier: ImageTierName,
    tierCfg: ImageTierConfig,
    startedAt: number
  ): Promise<ImageGenerationResponse> {
    if (!res.ok) {
      const text = await safeReadText(res);
      return errorResult(
        mapStatusToCode(res.status),
        `HTTP ${res.status}: ${truncate(text, 600)}`,
        startedAt
      );
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const json = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        error?: { message?: string; code?: string };
      };
      if (json.error) {
        return errorResult(
          json.error.code ?? "PROVIDER_ERROR",
          json.error.message ?? "Provider returned an error",
          startedAt
        );
      }
      const first = json.data?.[0];
      if (first?.b64_json) {
        const buf = Buffer.from(first.b64_json, "base64");
        return {
          kind: "done",
          buffer: buf,
          mimeType: detectMime(buf),
          tier,
          model: tierCfg.model,
          durationMs: Date.now() - startedAt,
          estimatedCostUsd: tierCfg.estimatedCostUsd
        };
      }
      if (first?.url) {
        const buf = await fetchUrlBuffer(first.url);
        if (!buf) {
          return errorResult(
            "DECODE_FAILED",
            "provider returned a URL but it could not be downloaded",
            startedAt
          );
        }
        return {
          kind: "done",
          buffer: buf,
          mimeType: detectMime(buf),
          tier,
          model: tierCfg.model,
          durationMs: Date.now() - startedAt,
          estimatedCostUsd: tierCfg.estimatedCostUsd
        };
      }
      return errorResult(
        "DECODE_FAILED",
        "provider returned JSON without b64_json or url",
        startedAt
      );
    }
    // 直接返回 image/* 二进制（少数 provider）
    if (ct.startsWith("image/")) {
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      return {
        kind: "done",
        buffer: buf,
        mimeType: ct,
        tier,
        model: tierCfg.model,
        durationMs: Date.now() - startedAt,
        estimatedCostUsd: tierCfg.estimatedCostUsd
      };
    }
    const text = await safeReadText(res);
    return errorResult(
      "UNKNOWN_RESPONSE",
      `unexpected content-type=${ct}, body=${truncate(text, 600)}`,
      startedAt
    );
  }
}

// ===== helpers =====

function joinUrl(baseUrl: string, suffix: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed)
    ? `${trimmed}/${suffix}`
    : `${trimmed}/v1/${suffix}`;
}

function errorResult(
  code: string,
  message: string,
  startedAt: number
): ImageGenerationError {
  return {
    kind: "error",
    code,
    message,
    durationMs: Date.now() - startedAt
  };
}

function mapStatusToCode(status: number): string {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 400) return "BAD_REQUEST";
  if (status >= 500) return "PROVIDER_ERROR";
  return `HTTP_${status}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function dataUrlOrUrlToBlob(input: string): Promise<Blob> {
  if (input.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(input);
    if (m && m[1] && m[2] != null) {
      const buf = Buffer.from(m[2], "base64");
      return new Blob([buf], { type: m[1] });
    }
    throw new Error("invalid data URL");
  }
  const res = await fetch(input);
  if (!res.ok) throw new Error(`failed to download image: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  const ct = res.headers.get("content-type") ?? "image/png";
  return new Blob([ab], { type: ct });
}

async function fetchUrlBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/**
 * 简易 magic number 探测：仅区分 PNG / WebP / JPEG，足够 hatch-pet 用。
 */
function detectMime(buf: Buffer): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}
