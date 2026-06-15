import type { LLMProviderConfig } from "../../shared/ipc-contract.js";

/**
 * 多模态内容块：用于把图片喂给 vision 模型。
 * - text  → 普通文本段
 * - image → 远程 URL 或 data URI（base64）；detail 用 OpenAI 风格 low/high/auto
 */
export type ChatContentPart =
  | { type: "text"; text: string }
  | {
      type: "image";
      /** 可以是 https:// URL，也可以是 data:image/png;base64,xxx 形式 */
      url: string;
      /** OpenAI 的 detail；Anthropic 忽略此字段。 */
      detail?: "low" | "high" | "auto";
    };

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatRequest {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: ChatMessageContent }>;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
  signal?: AbortSignal;
  /**
   * 用这个临时覆盖 provider.model（不改全局配置）。
   * 用法：深度蒸馏调研阶段切到 gpt-4o-mini-search-preview，
   * 其他阶段沿用 provider 默认 model（推荐 deepseek-v4-flash）。
   */
  modelOverride?: string;
}

export type ChatChunk =
  | { kind: "delta"; text: string }
  | { kind: "done"; finishReason: "stop" | "length" | "error" | "safety"; usage?: { promptTokens: number; completionTokens: number } }
  | { kind: "error"; code: string; message: string };

/** 给上层（深度蒸馏 / 外貌调研）使用：要求模型在回答时联网搜索。 */
export interface ChatWithToolsRequest extends ChatRequest {
  /** 启用 web_search。是否真的能用取决于 model + provider 能力探测。 */
  enableWebSearch: boolean;
  /** 单次调用允许的工具调用上限（Anthropic 用，OpenAI search-preview 自管理）。 */
  maxToolCalls?: number;
  /** OpenAI search-preview 的 search_context_size：low/medium/high。 */
  searchContextSize?: "low" | "medium" | "high";
}

/** 工具调用过程中产生的事件，UI 可以据此渲染「正在搜索 …」之类提示。 */
export type ToolEvent =
  | { kind: "tool_start"; tool: "web_search"; query?: string }
  | { kind: "tool_end"; tool: "web_search"; sources?: string[] };

export interface ChatWithToolsResult {
  kind: "done";
  text: string;
  finishReason: "stop" | "length" | "error" | "safety";
  toolEvents: ToolEvent[];
  /** 模型在回答中明确引用的来源 URL（用于落到 ResearchDoc.sources）。 */
  citations: string[];
}

export interface ChatWithToolsError {
  kind: "error";
  code: string;
  message: string;
  toolEvents: ToolEvent[];
}

/**
 * OpenAI Chat Completions 端点上的「内置联网搜索模型」：模型名命中即认为支持 web_search。
 * 列出的是 OhMyGPT / OpenAI 都上架的模型。
 */
const OPENAI_SEARCH_MODEL_KEYWORDS = ["search-preview", "search-api"];

/** Anthropic 上支持 server-side web_search 工具的模型前缀。 */
const ANTHROPIC_WEB_SEARCH_MODELS = [
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
  "claude-3-7",
  "claude-haiku-4",
  "claude-sonnet-4",
  "claude-opus-4",
  "claude-4"
];

/**
 * 已知支持 vision（图片输入）的模型关键字。
 * OpenAI 系：gpt-4o / gpt-4-turbo / gpt-4.1 / gpt-5 / gpt-5.1 / o3 系列均支持。
 * Anthropic 系：claude-3 / claude-3.5 / claude-3.7 / claude-4 系列均支持。
 *
 * 仅用作静态白名单；最终是否真能用 probeVision 实测覆盖。
 */
const VISION_MODEL_KEYWORDS = [
  // OpenAI
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-4.1",
  "gpt-4-vision",
  "gpt-5",
  "o1",
  "o3",
  "o4",
  // Anthropic
  "claude-3",
  "claude-haiku-4",
  "claude-sonnet-4",
  "claude-opus-4",
  "claude-4",
  // ByteDance Doubao（OhMyGPT 等多模态读图）
  "doubao",
  "seed-2",
  "bytedance"
];

/** 参考图 vision 读图 / 自检专用模型（与主模型分离，主模型可为 DeepSeek 等纯文本模型）。 */
export const DEFAULT_VISION_MODEL = "bytedance/doubao-seed-2.0-lite-260428";

export function resolveVisionModel(
  provider: LLMProviderConfig | null | undefined,
  modelOverride?: string
): string {
  const trimmed = modelOverride?.trim();
  if (trimmed) return trimmed;
  const fromProvider = provider?.visionModel?.trim();
  if (fromProvider) return fromProvider;
  return DEFAULT_VISION_MODEL;
}

/** 1×1 透明 PNG 的 data URI；用于 vision probe。 */
const TINY_PROBE_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function matchesVisionModel(model: string): boolean {
  const lower = model.toLowerCase();
  return VISION_MODEL_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * 极简 LLM 适配器。
 *
 * OpenAI 兼容协议：走 /v1/chat/completions。
 *   - 普通模型：常规 chat
 *   - search-preview / search-api 系列：附加 web_search_options，回包带 annotations.url_citation
 *
 * Anthropic 兼容协议：走 /v1/messages。
 *   - 已知支持 server-side web_search 的模型：附加 tools = [{ type: "web_search_20250305" }]
 *
 * OpenAI Responses API 路径已删除——OhMyGPT 等主流中转站不支持，OpenAI 官方也允许在
 * chat/completions 上通过 search-preview 模型获得联网能力。
 */
export class LLMAdapter {
  constructor(private provider: () => LLMProviderConfig | null) {}

  /** 参考图读图 / 视觉自检使用的模型（独立于 provider.model）。 */
  getVisionModel(modelOverride?: string): string {
    return resolveVisionModel(this.provider(), modelOverride);
  }

  /**
   * 检测当前 provider + (可选) 指定 model 是否声明支持 web_search。
   * UI 用它决定是否显示「深度版」按钮。
   */
  detectCapabilities(modelOverride?: string): { webSearch: boolean; reason: string } {
    const p = this.provider();
    if (!p) return { webSearch: false, reason: "未配置 LLM 提供商" };
    const model = (modelOverride ?? p.model ?? "").toLowerCase();
    if (model.includes("deepseek")) {
      return {
        webSearch: false,
        reason:
          "DeepSeek 系列（含 V4 Flash）不支持 OpenAI search-preview 式内置联网；深度蒸馏将使用模型训练知识。需要联网请换 gpt-*-search-preview 或 Claude web_search 模型。"
      };
    }
    if (p.kind === "openai-compatible") {
      // 当 model 已明确是 search 系列：直接 OK
      if (matchesSearchModel(model)) {
        return { webSearch: true, reason: `${model} 自带联网（chat/completions + web_search_options）` };
      }
      // 当 model 是普通模型但 provider 是 OhMyGPT / OpenAI 系：UI 仍然可以提供「深度版」入口，
      // 因为我们会在调研阶段切到 search-preview。
      const allowsSearchModels =
        /(^|\.)openai\.(com|azure\.com)/.test(p.baseUrl) ||
        /ohmygpt\.com|opapi\.win|ohmycdn\.com|hash070\.com/.test(p.baseUrl);
      if (allowsSearchModels) {
        return {
          webSearch: true,
          reason: `${p.baseUrl} 支持 search-preview 系列；调研阶段会切到 gpt-4o-mini-search-preview`
        };
      }
      return {
        webSearch: false,
        reason: `当前 baseUrl (${p.baseUrl}) 不在已知支持 search-preview 的清单`
      };
    }
    if (p.kind === "anthropic-compatible") {
      const known = ANTHROPIC_WEB_SEARCH_MODELS.some((m) => model.startsWith(m));
      if (known) return { webSearch: true, reason: `Anthropic ${model} 支持 server-side web_search 工具` };
      return {
        webSearch: false,
        reason: `Anthropic 协议下，仅 ${ANTHROPIC_WEB_SEARCH_MODELS.join("/")} 系列支持 web_search`
      };
    }
    return { webSearch: false, reason: "未知的 provider 协议" };
  }

  /**
   * 静态检测当前 provider + model 是否声明支持视觉输入。
   * UI 用它决定是否允许用户上传参考图、是否在「真实视觉测试」按钮前显示禁用态。
   */
  detectVisionCapability(modelOverride?: string): { vision: boolean; reason: string } {
    const p = this.provider();
    if (!p) return { vision: false, reason: "未配置 LLM 提供商" };
    const model = this.getVisionModel(modelOverride).toLowerCase();
    if (!model) return { vision: false, reason: "未配置视觉模型" };
    if (matchesVisionModel(model)) {
      return {
        vision: true,
        reason: `${model} 为参考图读图专用模型（主模型 ${p.model} 可仍为纯文本）`
      };
    }
    return {
      vision: false,
      reason: `${model} 不在已知 vision 白名单（doubao-seed / gpt-4o / claude-3+ 等）`
    };
  }

  /**
   * 实测探测：发一张 1×1 透明 PNG + 「only reply 'ok'」请求，验证当前 provider/代理是否真能吃图。
   * 用于发现「声明支持 vision 但中转 strip 了 image_url」的代理。
   *
   * 返回：
   *   - ok=true  → 模型确实接受了多模态请求（response 拿到了文本）
   *   - ok=false → 网络 / 鉴权 / 代理拒绝多模态 / 模型不支持
   */
  async probeVision(modelOverride?: string): Promise<{
    ok: boolean;
    latencyMs?: number;
    reason?: string;
  }> {
    const p = this.provider();
    if (!p) return { ok: false, reason: "未配置 LLM 提供商" };
    const startedAt = Date.now();
    try {
      const r = await this.chatOnce({
        systemPrompt: "Reply with exactly the word ok in lowercase.",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image in one word." },
              { type: "image", url: TINY_PROBE_PNG_DATA_URI, detail: "low" }
            ]
          }
        ],
        maxTokens: 16,
        stream: false,
        modelOverride: modelOverride ?? this.getVisionModel()
      });
      const latencyMs = Date.now() - startedAt;
      if (r.kind === "error") {
        return { ok: false, latencyMs, reason: r.message };
      }
      // 只要能回个非空字符串就当作真支持；个别模型对 1×1 图回 'unknown' / 'blank' 也都算 ok。
      return { ok: (r.text ?? "").length > 0, latencyMs };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        reason: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /**
   * 实测探测：发一个一次性最小 search ping，看代理 / provider 是否真的返回 annotations。
   * 用于发现 OhMyGPT 这种"声称支持 search-preview 但中转 strip 了 annotations"的代理。
   *
   * 返回：
   *   - ok=true + citations.length > 0 → 真支持
   *   - ok=true + citations.length === 0 → 代理静默吞掉 annotations，UI 应当警告
   *   - ok=false → 网络 / 鉴权问题
   */
  async probeWebSearch(modelOverride?: string): Promise<{
    ok: boolean;
    realWebSearch: boolean;
    latencyMs?: number;
    citations: number;
    reason?: string;
  }> {
    const p = this.provider();
    if (!p) return { ok: false, realWebSearch: false, citations: 0, reason: "未配置 LLM 提供商" };
    // 只对 openai-compatible 支持，因为我们只有 search-preview 模型走 web_search_options。
    // Anthropic 路径用 server-side tool，已经在 chatWithTools 里通过 tool_use 块判定。
    if (p.kind !== "openai-compatible") {
      return {
        ok: false,
        realWebSearch: false,
        citations: 0,
        reason: "实测仅支持 OpenAI 兼容协议（Anthropic 通过 tool block 判定）"
      };
    }
    const model = modelOverride ?? "gpt-4o-mini-search-preview";
    const startedAt = Date.now();
    const r = await this.chatWithTools({
      systemPrompt: "回答时必须引用至少一个 URL 来源。",
      messages: [
        {
          role: "user",
          content: "2024 年诺贝尔物理学奖获得者是谁？给出官方公告页 URL。一句话。"
        }
      ],
      maxTokens: 200,
      stream: false,
      enableWebSearch: true,
      modelOverride: model,
      searchContextSize: "low"
    });
    const latencyMs = Date.now() - startedAt;
    if (r.kind === "error") {
      return { ok: false, realWebSearch: false, citations: 0, latencyMs, reason: r.message };
    }
    return {
      ok: true,
      realWebSearch: r.citations.length > 0,
      citations: r.citations.length,
      latencyMs
    };
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const p = this.provider();
    if (!p) return { ok: false, error: "未配置 LLM 提供商" };
    const startedAt = Date.now();
    try {
      const out = await this.chatOnce({
        systemPrompt: "回答 'ok'，仅一个单词。",
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 4,
        stream: false
      });
      return { ok: out.kind === "done" && (out.text ?? "").length >= 0, latencyMs: Date.now() - startedAt };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async chatOnce(req: ChatRequest): Promise<
    | { kind: "done"; text: string; finishReason: "stop" | "length" | "error" | "safety" }
    | { kind: "error"; code: string; message: string }
  > {
    const collected: string[] = [];
    let finishReason: "stop" | "length" | "error" | "safety" = "stop";
    for await (const chunk of this.chatStream({ ...req, stream: false })) {
      if (chunk.kind === "delta") collected.push(chunk.text);
      if (chunk.kind === "done") finishReason = chunk.finishReason;
      if (chunk.kind === "error") return { kind: "error", code: chunk.code, message: chunk.message };
    }
    return { kind: "done", text: collected.join(""), finishReason };
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<ChatChunk> {
    const provider = this.provider();
    if (!provider) {
      yield { kind: "error", code: "NO_PROVIDER", message: "未配置 LLM 提供商" };
      return;
    }
    if (provider.kind === "openai-compatible") {
      yield* this.callOpenAI(provider, req);
      return;
    }
    if (provider.kind === "anthropic-compatible") {
      yield* this.callAnthropic(provider, req);
      return;
    }
    yield { kind: "error", code: "UNSUPPORTED_PROVIDER", message: `不支持的提供商：${(provider as { kind: string }).kind}` };
  }

  private async *callOpenAI(p: LLMProviderConfig, req: ChatRequest): AsyncGenerator<ChatChunk> {
    const url = chatCompletionsUrl(p);
    const model = req.modelOverride ?? p.model;
    const isSearch = matchesSearchModel(model);
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: req.systemPrompt },
        ...req.messages.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content)
        }))
      ],
      max_tokens: req.maxTokens ?? p.defaultMaxTokens ?? 800,
      stream: req.stream
    };
    // search-preview 模型不支持 temperature / top_p / tools 等参数，必须省略
    if (!isSearch) {
      body.temperature = req.temperature ?? p.defaultTemperature ?? 0.7;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.apiKey}`
        },
        body: JSON.stringify(body),
        signal: req.signal
      });
    } catch (e) {
      yield {
        kind: "error",
        code: "NETWORK_ERROR",
        message: e instanceof Error ? e.message : String(e)
      };
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { kind: "error", code: mapHttpToCode(res.status), message: text.slice(0, 500) };
      return;
    }

    if (!req.stream) {
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      const fr = mapFinishReason(json.choices?.[0]?.finish_reason);
      yield { kind: "delta", text };
      yield { kind: "done", finishReason: fr };
      return;
    }

    yield* parseSSE(res, (data) => {
      if (data === "[DONE]") return { kind: "done", finishReason: "stop" };
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) return { kind: "delta", text: delta };
        const fr = json.choices?.[0]?.finish_reason;
        if (fr) return { kind: "done", finishReason: mapFinishReason(fr) };
      } catch {
        // ignore
      }
      return null;
    });
  }

  private async *callAnthropic(p: LLMProviderConfig, req: ChatRequest): AsyncGenerator<ChatChunk> {
    const url = trimRightSlash(p.baseUrl) + "/v1/messages";
    const body = {
      model: req.modelOverride ?? p.model,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: toAnthropicContent(m.content)
      })),
      temperature: req.temperature ?? p.defaultTemperature ?? 0.7,
      max_tokens: req.maxTokens ?? p.defaultMaxTokens ?? 800,
      stream: req.stream
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": p.apiKey
        },
        body: JSON.stringify(body),
        signal: req.signal
      });
    } catch (e) {
      yield {
        kind: "error",
        code: "NETWORK_ERROR",
        message: e instanceof Error ? e.message : String(e)
      };
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { kind: "error", code: mapHttpToCode(res.status), message: text.slice(0, 500) };
      return;
    }

    if (!req.stream) {
      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        stop_reason?: string;
      };
      const text = (json.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("");
      yield { kind: "delta", text };
      yield { kind: "done", finishReason: mapFinishReason(json.stop_reason) };
      return;
    }

    yield* parseSSE(res, (data) => {
      try {
        const json = JSON.parse(data) as {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { stop_reason?: string };
        };
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta.text) {
          return { kind: "delta", text: json.delta.text };
        }
        if (json.type === "message_stop") {
          return { kind: "done", finishReason: "stop" };
        }
      } catch {
        // ignore
      }
      return null;
    });
  }

  /**
   * 带联网搜索的一次性问答（非流式）。
   * 路由规则：
   *   1) enableWebSearch=false → 普通 chatOnce
   *   2) modelOverride / provider.model 命中 search 关键字 → OpenAI search-preview 路径
   *   3) Anthropic + 已知 web_search 模型 → server-side web_search tool
   *   4) 其他 → error。联网调研不能静默降级为普通 chat。
   */
  async chatWithTools(req: ChatWithToolsRequest): Promise<ChatWithToolsResult | ChatWithToolsError> {
    const provider = this.provider();
    if (!provider) {
      return { kind: "error", code: "NO_PROVIDER", message: "未配置 LLM 提供商", toolEvents: [] };
    }

    const wantsSearch = req.enableWebSearch === true;
    if (!wantsSearch) {
      return this.fallbackChatOnce(req);
    }

    if (provider.kind === "openai-compatible") {
      const model = req.modelOverride ?? provider.model;
      if (matchesSearchModel(model)) {
        return this.openAISearchPreview(provider, model, req);
      }
      return {
        kind: "error",
        code: "WEB_SEARCH_UNSUPPORTED_MODEL",
        message:
          `已要求联网搜索，但模型 ${model} 不是 search-preview/search-api 系列。` +
          `请把调研模型改为 gpt-4o-mini-search-preview / gpt-4o-search-preview，` +
          `或换支持 server-side web_search 的 Anthropic 模型。`,
        toolEvents: []
      };
    }

    if (provider.kind === "anthropic-compatible") {
      // OpenAI 的 search-preview 研究模型只适用于 openai-compatible。
      // Anthropic 必须使用 provider.model，否则 UI 默认 researchModel 会把 Claude 路径误导到
      // gpt-4o-mini-search-preview 这个不存在的 Anthropic 模型名。
      const model = provider.model;
      const isKnownAnthropic = ANTHROPIC_WEB_SEARCH_MODELS.some((m) =>
        model.toLowerCase().startsWith(m)
      );
      if (isKnownAnthropic) {
        return this.anthropicChatWithTools(provider, model, req);
      }
      return {
        kind: "error",
        code: "WEB_SEARCH_UNSUPPORTED_MODEL",
        message:
          `已要求联网搜索，但 Anthropic 模型 ${model} 不在 server-side web_search 白名单。` +
          `请换 claude-sonnet-4 / claude-opus-4 / claude-3-5-sonnet 等支持 web_search 的模型。`,
        toolEvents: []
      };
    }

    return {
      kind: "error",
      code: "UNSUPPORTED_PROVIDER",
      message: "当前 provider 不支持工具调用",
      toolEvents: []
    };
  }

  /** 普通 chatOnce 包成 ChatWithToolsResult / Error 形态。 */
  private async fallbackChatOnce(
    req: ChatRequest
  ): Promise<ChatWithToolsResult | ChatWithToolsError> {
    const r = await this.chatOnce(req);
    if (r.kind === "error") {
      return { kind: "error", code: r.code, message: r.message, toolEvents: [] };
    }
    return { kind: "done", text: r.text, finishReason: r.finishReason, toolEvents: [], citations: [] };
  }

  /**
   * OpenAI 内置联网模型（gpt-4o-mini-search-preview / gpt-4o-search-preview / gpt-5-search-api）：
   *   POST /v1/chat/completions
   *   body 加 web_search_options: { search_context_size: "low|medium|high" }
   *   model 自带搜索，不传 tools。回包：
   *     choices[0].message.content    → 正文
   *     choices[0].message.annotations → [{ type:"url_citation", url_citation:{url,title} }]
   * 这一类模型不支持 temperature / top_p / tools，body 中省略。
   */
  private async openAISearchPreview(
    p: LLMProviderConfig,
    model: string,
    req: ChatWithToolsRequest
  ): Promise<ChatWithToolsResult | ChatWithToolsError> {
    const url = chatCompletionsUrl(p);
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: req.systemPrompt },
        ...req.messages.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content)
        }))
      ],
      max_tokens: req.maxTokens ?? p.defaultMaxTokens ?? 3500,
      stream: false,
      web_search_options: {
        search_context_size: req.searchContextSize ?? "medium"
      }
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.apiKey}`
        },
        body: JSON.stringify(body),
        signal: req.signal
      });
    } catch (e) {
      return {
        kind: "error",
        code: "NETWORK_ERROR",
        message: e instanceof Error ? e.message : String(e),
        toolEvents: []
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "error", code: mapHttpToCode(res.status), message: text.slice(0, 800), toolEvents: [] };
    }

    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{
        message?: {
          content?: string;
          annotations?: Array<{
            type?: string;
            url_citation?: { url?: string; title?: string };
            // 也兼容部分实现把 url/title 直接平铺的写法
            url?: string;
            title?: string;
          }>;
        };
        finish_reason?: string;
      }>;
    } | null;

    if (!json) {
      return { kind: "error", code: "BAD_RESPONSE", message: "search-preview 响应不可解析", toolEvents: [] };
    }

    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? "";
    const finishReason = mapFinishReason(choice?.finish_reason);
    const citations = new Set<string>();
    for (const ann of choice?.message?.annotations ?? []) {
      const url1 = ann.url_citation?.url ?? ann.url;
      if (typeof url1 === "string" && url1.length > 0) citations.add(url1);
    }
    const toolEvents: ToolEvent[] = [];
    if (citations.size > 0) {
      toolEvents.push({ kind: "tool_start", tool: "web_search" });
      toolEvents.push({ kind: "tool_end", tool: "web_search", sources: Array.from(citations) });
    }
    if (req.enableWebSearch && citations.size === 0) {
      return {
        kind: "error",
        code: "WEB_SEARCH_NOT_CONFIRMED",
        message:
          "search-preview 返回中没有 url_citation annotations，无法确认真实联网。当前 baseUrl 可能吞掉 web_search_options 或 annotations，请换 OpenAI 直连或支持 search 的代理。",
        toolEvents: []
      };
    }
    return {
      kind: "done",
      text,
      finishReason,
      toolEvents,
      citations: Array.from(citations)
    };
  }

  /**
   * Anthropic Messages API + 服务端 web_search 工具：
   *   POST /v1/messages
   *   tools: [{ type: "web_search_20250305", name: "web_search", max_uses: N }]
   * Claude 在服务端完成搜索 → 返回 server_tool_use + web_search_tool_result + text 块。
   */
  private async anthropicChatWithTools(
    p: LLMProviderConfig,
    model: string,
    req: ChatWithToolsRequest
  ): Promise<ChatWithToolsResult | ChatWithToolsError> {
    const url = trimRightSlash(p.baseUrl) + "/v1/messages";
    const body = {
      model,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: toAnthropicContent(m.content)
      })),
      temperature: req.temperature ?? p.defaultTemperature ?? 0.5,
      max_tokens: req.maxTokens ?? p.defaultMaxTokens ?? 3500,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: req.maxToolCalls ?? 8
        }
      ]
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": p.apiKey
        },
        body: JSON.stringify(body),
        signal: req.signal
      });
    } catch (e) {
      return {
        kind: "error",
        code: "NETWORK_ERROR",
        message: e instanceof Error ? e.message : String(e),
        toolEvents: []
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { kind: "error", code: mapHttpToCode(res.status), message: text.slice(0, 500), toolEvents: [] };
    }

    const json = (await res.json().catch(() => null)) as {
      content?: Array<{
        type?: string;
        text?: string;
        name?: string;
        input?: { query?: string };
        tool_use_id?: string;
        content?: Array<{ type?: string; url?: string; title?: string }>;
        citations?: Array<{ url?: string; title?: string }>;
      }>;
      stop_reason?: string;
    } | null;

    if (!json) {
      return { kind: "error", code: "BAD_RESPONSE", message: "Anthropic 响应不可解析", toolEvents: [] };
    }

    const toolEvents: ToolEvent[] = [];
    const citations = new Set<string>();
    let text = "";

    for (const block of json.content ?? []) {
      if (block.type === "server_tool_use" && block.name === "web_search") {
        toolEvents.push({ kind: "tool_start", tool: "web_search", query: block.input?.query });
        continue;
      }
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        const urls: string[] = [];
        for (const r of block.content) {
          if (typeof r.url === "string") {
            urls.push(r.url);
            citations.add(r.url);
          }
        }
        toolEvents.push({ kind: "tool_end", tool: "web_search", sources: urls });
        continue;
      }
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
        for (const c of block.citations ?? []) {
          if (typeof c.url === "string") citations.add(c.url);
        }
      }
    }

    if (req.enableWebSearch && toolEvents.length === 0 && citations.size === 0) {
      return {
        kind: "error",
        code: "WEB_SEARCH_NOT_CONFIRMED",
        message:
          "Anthropic 响应中没有 server_tool_use/web_search_tool_result/citations，无法确认真实联网。请确认模型与 baseUrl 支持 server-side web_search。",
        toolEvents: []
      };
    }

    return {
      kind: "done",
      text,
      finishReason: mapFinishReason(json.stop_reason),
      toolEvents,
      citations: Array.from(citations)
    };
  }
}

/** 模型名是否命中「自带联网」关键字（search-preview / search-api）。 */
function matchesSearchModel(model: string): boolean {
  const lower = model.toLowerCase();
  return OPENAI_SEARCH_MODEL_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * 把内部统一的 ChatMessageContent 转成 OpenAI chat/completions 期望的格式。
 *   - 字符串 → 直接返回（最常见路径，保持向后兼容）
 *   - 多模态数组 → [{type:'text',text}, {type:'image_url',image_url:{url,detail}}]
 */
function toOpenAIContent(content: ChatMessageContent): unknown {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    return {
      type: "image_url",
      image_url: { url: part.url, detail: part.detail ?? "auto" }
    };
  });
}

/**
 * 把内部统一的 ChatMessageContent 转成 Anthropic /v1/messages 期望的格式。
 *   - 字符串 → 仍然包成 [{type:'text',text}]，避免 system + multimodal mix 时的边界 case
 *   - 多模态 → [{type:'text',text}, {type:'image',source:{type:'base64'|'url',...}}]
 */
function toAnthropicContent(content: ChatMessageContent): unknown {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text };
    const url = part.url;
    if (url.startsWith("data:")) {
      // data:image/png;base64,xxxx
      const m = /^data:([^;]+);base64,(.*)$/.exec(url);
      if (m) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: m[1],
            data: m[2]
          }
        };
      }
    }
    return {
      type: "image",
      source: {
        type: "url",
        url
      }
    };
  });
}

/**
 * 把 baseUrl 与 /v1/chat/completions 拼起来，兼容两种用户配置：
 *   - baseUrl = https://api.openai.com           → /v1/chat/completions
 *   - baseUrl = https://api.ohmygpt.com/v1       → /chat/completions
 *   - baseUrl 末尾带 / 也要去掉
 */
function chatCompletionsUrl(p: LLMProviderConfig): string {
  const trimmed = trimRightSlash(p.baseUrl);
  return /\/v\d+$/.test(trimmed) ? trimmed + "/chat/completions" : trimmed + "/v1/chat/completions";
}

function trimRightSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function mapHttpToCode(status: number): string {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_ERROR";
  return "HTTP_" + status;
}

function mapFinishReason(raw: string | null | undefined): "stop" | "length" | "error" | "safety" {
  switch (raw) {
    case "stop":
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "length":
    case "max_tokens":
      return "length";
    case "content_filter":
    case "safety":
      return "safety";
    default:
      return "stop";
  }
}

async function* parseSSE(
  res: Response,
  mapper: (data: string) => ChatChunk | null
): AsyncGenerator<ChatChunk> {
  if (!res.body) {
    yield { kind: "error", code: "EMPTY_RESPONSE", message: "no body" };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload) continue;
      const chunk = mapper(payload);
      if (chunk) yield chunk;
      if (chunk?.kind === "done") return;
    }
  }
  yield { kind: "done", finishReason: "stop" };
}
