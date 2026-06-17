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

const CHAT_FETCH_TIMEOUT_MS = 90_000;

function mergeChatFetchSignal(userSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(CHAT_FETCH_TIMEOUT_MS);
  if (!userSignal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([userSignal, timeoutSignal]);
  }
  const ac = new AbortController();
  const abort = () => ac.abort();
  if (userSignal.aborted) {
    ac.abort();
    return ac.signal;
  }
  userSignal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return ac.signal;
}

function fetchErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.message.includes("timeout")) {
      return "模型响应超时（90s），请检查网络或 API 配置后重试";
    }
    if (e.name === "AbortError") {
      return "请求已取消";
    }
    return e.message;
  }
  return String(e);
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
  /**
   * 给主进程日志埋点用的可读标签（如 "research:writings:三笠"）。
   * 不影响请求语义，纯为定位"哪个 agent 在哪个角色上拿不到 citations"。
   */
  requestLabel?: string;
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

function isSearchRelayBaseUrl(baseUrl: string): boolean {
  return (
    /(^|\.)openai\.(com|azure\.com)/.test(baseUrl) ||
    /ohmygpt\.com|opapi\.win|ohmycdn\.com|hash070\.com/.test(baseUrl)
  );
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

    if (p.kind === "openai-compatible") {
      if (matchesSearchModel(model)) {
        return { webSearch: true, reason: `${model} 自带联网检索能力` };
      }
      if (isSearchRelayBaseUrl(p.baseUrl)) {
        const mainNote = model.includes("deepseek")
          ? `主模型 ${model} 无内置联网，`
          : "";
        return {
          webSearch: true,
          reason: `${mainNote}${p.baseUrl} 支持联网检索模型；调研阶段会自动切换`
        };
      }
      if (model.includes("deepseek")) {
        return {
          webSearch: false,
          reason:
            "DeepSeek 直连不支持内置联网检索；深度蒸馏将使用模型训练知识。需要联网请换 OhMyGPT 等中转，或改用带联网能力的模型。"
        };
      }
      return {
        webSearch: false,
        reason: `当前 baseUrl (${p.baseUrl}) 不在已知支持联网检索的清单`
      };
    }
    if (p.kind === "anthropic-compatible") {
      const known = ANTHROPIC_WEB_SEARCH_MODELS.some((m) => model.startsWith(m));
      if (known) return { webSearch: true, reason: `Anthropic ${model} 支持联网检索` };
      return {
        webSearch: false,
        reason: `Anthropic 协议下，仅 ${ANTHROPIC_WEB_SEARCH_MODELS.join("/")} 系列支持联网检索`
      };
    }
    return { webSearch: false, reason: "未知的 provider 协议" };
  }

  /**
   * 静态检测当前 provider + model 是否声明支持视觉输入。
   * UI 用它决定是否允许用户上传参考图、是否在「真实视觉测试」按钮前显示禁用态。
   */
  detectVisionCapability(modelOverride?: string): {
    vision: boolean;
    reason: string;
    visionModel: string;
    mainModel: string;
  } {
    const p = this.provider();
    if (!p) {
      return {
        vision: false,
        reason: "未配置 LLM 提供商",
        visionModel: "",
        mainModel: ""
      };
    }
    const visionModel = this.getVisionModel(modelOverride);
    const model = visionModel.toLowerCase();
    const mainModel = p.model ?? "";
    if (!model) {
      return {
        vision: false,
        reason: "未配置视觉模型",
        visionModel,
        mainModel
      };
    }
    if (matchesVisionModel(model)) {
      return {
        vision: true,
        reason: `读图模型 ${visionModel}（主模型 ${mainModel} 仅用于文本）`,
        visionModel,
        mainModel
      };
    }
    return {
      vision: false,
      reason: `读图模型 ${visionModel} 不在已知 vision 白名单（doubao-seed / gpt-4o / claude-3+ 等）`,
      visionModel,
      mainModel
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
        signal: mergeChatFetchSignal(req.signal)
      });
    } catch (e) {
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.message.includes("timeout"));
      yield {
        kind: "error",
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: fetchErrorMessage(e)
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
        signal: mergeChatFetchSignal(req.signal)
      });
    } catch (e) {
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.message.includes("timeout"));
      yield {
        kind: "error",
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: fetchErrorMessage(e)
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
   *
   * 已验证的失败模式（scripts/debug/debug-research-prompts.mjs）：
   *   在 819 tokens 的「长任务式 system prompt」下，OhMyGPT/OpenAI 中转的
   *   search-preview 模型经常**跳过搜索直接靠训练知识硬编**——HTTP 200、
   *   annotations=[]、正文也没有任何 URL，1255 tokens 的回答完全是编的。
   *
   * 修复策略（两层）：
   *   1) prompt 层在 nuwa-prompts/research-agents.ts 顶部加强指令 + 候选 query
   *      （让模型一开始就调用 web_search）。
   *   2) 适配器层：首次拿不到 citations 时，用**短 query** 重问一次——
   *      把 user 最后一条短指令重写为"请用 web_search 查 X 的 Y，给 5 个真实 URL"，
   *      实测短指令命中率显著高于长任务式。
   */
  private async openAISearchPreview(
    p: LLMProviderConfig,
    model: string,
    req: ChatWithToolsRequest
  ): Promise<ChatWithToolsResult | ChatWithToolsError> {
    const requestId = (req.requestLabel ?? "anon") + "#" + ((Math.random() * 1e6) | 0).toString(36);
    const first = await this.callOpenAISearchOnce(
      p,
      model,
      req,
      req.searchContextSize ?? "medium",
      requestId,
      "first"
    );
    if (first.kind === "error") return first;
    if (first.citations.length > 0 || !first.text) return first;

    // 没拿到任何来源：用更短、更直接的 query 重问一次（context 降到 low 加快重试）。
    // 这个变体的命中率显著高，因为 short query 触发 search-preview 模型 query
    // 改写为"搜索 query"的概率高，而长 task prompt 容易被改写为"任务规划"路径。
    const shortReask = buildShortReaskMessages(req);
    if (!shortReask) return first;
    const retry = await this.callOpenAISearchOnce(
      p,
      model,
      { ...req, messages: shortReask },
      "low",
      requestId,
      "retry-short-reask"
    );
    if (retry.kind === "error") return first;
    if (retry.citations.length > 0) {
      // 用 retry 的 citations，但把首次的长 markdown 留住作为最终正文——
      // 因为 short reask 只产出 5 个 URL，第一次的报告才是用户要看的内容。
      // 把 retry citations 合并到 first.citations，让 toolEvents 反映到 UI。
      const merged = new Set<string>([...first.citations, ...retry.citations]);
      const allCites = Array.from(merged);
      return {
        kind: "done",
        text: first.text + buildCitationFooter(retry.citations),
        finishReason: first.finishReason,
        toolEvents: [
          { kind: "tool_start", tool: "web_search" },
          { kind: "tool_end", tool: "web_search", sources: allCites }
        ],
        citations: allCites
      };
    }
    // 第二次仍空：返回首次结果，上层会把 webSearchUsed=false 当低可信处理。
    return first;
  }

  private async callOpenAISearchOnce(
    p: LLMProviderConfig,
    model: string,
    req: ChatWithToolsRequest,
    contextSize: "low" | "medium" | "high",
    requestId?: string,
    phase: "first" | "retry-short-reask" = "first"
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
        search_context_size: contextSize
      }
    };

    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.apiKey}`
        },
        body: JSON.stringify(body),
        signal: mergeChatFetchSignal(req.signal)
      });
    } catch (e) {
      const httpDt = Date.now() - startedAt;
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.message.includes("timeout"));
      logSearchCall({
        requestId,
        phase,
        url,
        model,
        contextSize,
        httpStatus: 0,
        httpDt,
        ok: false,
        errorPreview: "NETWORK: " + fetchErrorMessage(e)
      });
      return {
        kind: "error",
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: fetchErrorMessage(e),
        toolEvents: []
      };
    }

    const httpDt = Date.now() - startedAt;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logSearchCall({
        requestId,
        phase,
        url,
        model,
        contextSize,
        httpStatus: res.status,
        httpDt,
        ok: false,
        errorPreview: text.slice(0, 200)
      });
      return { kind: "error", code: mapHttpToCode(res.status), message: text.slice(0, 800), toolEvents: [] };
    }

    const rawText = await res.text().catch(() => "");
    let json: {
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
    } | null = null;
    try {
      json = JSON.parse(rawText);
    } catch {
      logSearchCall({
        requestId,
        phase,
        url,
        model,
        contextSize,
        httpStatus: res.status,
        httpDt,
        ok: false,
        errorPreview: "BAD_JSON: " + rawText.slice(0, 200)
      });
      return { kind: "error", code: "BAD_RESPONSE", message: "search-preview 响应不可解析", toolEvents: [] };
    }
    if (!json) {
      return { kind: "error", code: "BAD_RESPONSE", message: "search-preview 响应不可解析", toolEvents: [] };
    }

    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? "";
    const finishReason = mapFinishReason(choice?.finish_reason);
    const annRaw = choice?.message?.annotations ?? [];
    const messageKeys = choice?.message ? Object.keys(choice.message) : [];
    const citations = new Set<string>();
    for (const ann of annRaw) {
      const url1 = ann.url_citation?.url ?? ann.url;
      if (typeof url1 === "string" && url1.length > 0) citations.add(url1);
    }
    const citationsFromAnnotations = citations.size;
    // 部分中转完全不给 annotations，但模型在正文里用 Markdown 链接形式写了 URL。
    // 兜底：把正文里裸露的 http(s)://... 也收为引用，让 webSearchUsed 不至于错判为 false。
    if (citations.size === 0 && text.length > 0) {
      const urlRegex = /https?:\/\/[^\s)\]\u4e00-\u9fff，。；：、！？]+/g;
      const matches = text.match(urlRegex) ?? [];
      for (const u of matches) {
        const cleaned = u.replace(/[\]\)\.，。；：、]+$/, "");
        if (cleaned.length > 8) citations.add(cleaned);
        if (citations.size >= 6) break;
      }
    }
    const citationsFromInline = citations.size - citationsFromAnnotations;
    const toolEvents: ToolEvent[] = [];
    if (citations.size > 0) {
      toolEvents.push({ kind: "tool_start", tool: "web_search" });
      toolEvents.push({ kind: "tool_end", tool: "web_search", sources: Array.from(citations) });
    }
    logSearchCall({
      requestId,
      phase,
      url,
      model,
      contextSize,
      httpStatus: res.status,
      httpDt,
      ok: true,
      messageKeys,
      annotationsRaw: annRaw.length,
      citationsFromAnnotations,
      citationsFromInline,
      finalCitations: citations.size,
      textLen: text.length,
      verdict:
        citations.size > 0
          ? citationsFromAnnotations > 0
            ? "OK_ANNOTATIONS"
            : "OK_INLINE_FALLBACK"
          : text.length > 0
            ? "EMPTY_CITATIONS"
            : "EMPTY_BODY"
    });
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
        signal: mergeChatFetchSignal(req.signal)
      });
    } catch (e) {
      const isTimeout = e instanceof Error && (e.name === "TimeoutError" || e.message.includes("timeout"));
      return {
        kind: "error",
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        message: fetchErrorMessage(e),
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

/**
 * 把 messages 改写成「短 query 重问」用于 search-preview 失败重试。
 *
 * 取最后一条 user message，提取其中的人物名（如果有 `「XX」` 或 `「XX」「YY」` 这种结构），
 * 把整段 user 替换成短指令式："请用 web_search 查 XX 的相关资料，给我 5 个真实可访问的 URL 来源。"
 *
 * 短指令的命中率显著高于长任务式（实测 3/3 vs 0/3，见 scripts/debug/debug-prompt-shape.mjs）。
 * 同时把 system prompt 也缩短为单句"必须用 web_search"，避免长 system 再次诱导模型走训练知识。
 */
function buildShortReaskMessages(
  req: ChatWithToolsRequest
): ChatWithToolsRequest["messages"] | null {
  const lastUser = req.messages.slice().reverse().find((m) => m.role === "user");
  if (!lastUser || typeof lastUser.content !== "string") return null;
  // 提取「」中第一个引文（人物名）
  const m = lastUser.content.match(/「([^」]+)」/);
  const characterName = m?.[1]?.trim();
  // 提取角色维度（例如「碎片表达与风格」「人物时间线」），多用作搜索方向
  const dimMatches = Array.from(lastUser.content.matchAll(/「([^」]+)」/g));
  const dim = dimMatches.length >= 2 ? dimMatches[1]?.[1]?.trim() : undefined;
  if (!characterName) return null;
  const askParts = [
    `请用 web_search 查询「${characterName}」` +
      (dim ? `在「${dim}」维度上` : "") +
      "的真实资料：",
    "1. 调用 web_search 至少 2 次（中英文各一次）。",
    "2. 在回答末尾用 Markdown 无序列表给我 **5 个真实可访问的 URL**，每个 URL 配一句话说明。",
    "3. 严禁伪造 URL；如果某条搜索没结果，写「无可用来源」而不是编。"
  ];
  return [{ role: "user", content: askParts.join("\n") }];
}

/** 把 retry 拿到的 citations 追加到首次正文末尾，作为「补充来源」section。 */
function buildCitationFooter(citations: string[]): string {
  if (citations.length === 0) return "";
  const lines = ["", "", "## 补充来源（重试搜索）"];
  for (const u of citations.slice(0, 8)) {
    lines.push(`- ${u}`);
  }
  return lines.join("\n");
}

interface SearchCallLog {
  requestId?: string;
  phase: "first" | "retry-short-reask";
  url: string;
  model: string;
  contextSize: "low" | "medium" | "high";
  httpStatus: number;
  httpDt: number;
  ok: boolean;
  messageKeys?: string[];
  annotationsRaw?: number;
  citationsFromAnnotations?: number;
  citationsFromInline?: number;
  finalCitations?: number;
  textLen?: number;
  errorPreview?: string;
  verdict?:
    | "OK_ANNOTATIONS"
    | "OK_INLINE_FALLBACK"
    | "EMPTY_CITATIONS"
    | "EMPTY_BODY";
}

/**
 * 把每次 search-preview HTTP 调用的关键信号打到主进程控制台。
 *
 * 用户报「联网失败」时，让用户复制这些日志一行就能定位是哪一层吃掉了数据：
 *   - http_status 500/429/403/400  → 中转挂了 / 限流 / 鉴权
 *   - verdict=EMPTY_CITATIONS      → 中转吞 annotations 或模型没搜索
 *   - verdict=OK_INLINE_FALLBACK   → 中转吞 annotations 但模型给了内联 URL，被我们捞回来了
 *   - verdict=OK_ANNOTATIONS       → 正常路径
 */
/**
 * 日志输出双通道：
 *   - dev 终端能立刻看到；
 *   - 同时调 electron-log（如果可用）→ 写入 %APPDATA%/Bailin/logs/main.log，
 *     用户可直接发我文件诊断"调研失败"现场。
 *
 * electron-log 必须 lazy import：本文件也被独立 verify 脚本 require，
 * 那种情境下没有 Electron app 实例，不能在模块顶层 import 否则报错。
 */
let cachedLogger: { info: (s: string) => void; warn: (s: string) => void } | null = null;
function getElectronLog():
  | { info: (s: string) => void; warn: (s: string) => void }
  | null {
  if (cachedLogger) return cachedLogger;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require("electron-log/main") as {
      info: (s: string) => void;
      warn: (s: string) => void;
    };
    cachedLogger = mod;
    return cachedLogger;
  } catch {
    return null;
  }
}

function logSearchCall(info: SearchCallLog): void {
  const tag = `[LLM.search-preview]`;
  const head = `${tag} ${info.requestId ?? "-"} phase=${info.phase} model=${info.model} ctx=${info.contextSize} http=${info.httpStatus} dt=${info.httpDt}ms`;
  const elog = getElectronLog();
  if (!info.ok) {
    const line = `${head} FAIL err="${info.errorPreview ?? ""}"`;
    console.warn(line);
    elog?.warn(line);
    return;
  }
  const parts = [
    `keys=[${(info.messageKeys ?? []).join(",")}]`,
    `annRaw=${info.annotationsRaw ?? 0}`,
    `citAnn=${info.citationsFromAnnotations ?? 0}`,
    `citInline=${info.citationsFromInline ?? 0}`,
    `citFinal=${info.finalCitations ?? 0}`,
    `textLen=${info.textLen ?? 0}`,
    `verdict=${info.verdict ?? "-"}`
  ];
  const line = `${head} ${parts.join(" ")}`;
  const isOk = info.verdict === "OK_ANNOTATIONS" || info.verdict === "OK_INLINE_FALLBACK";
  if (isOk) {
    console.log(line);
    elog?.info(line);
  } else {
    console.warn(line);
    elog?.warn(line);
  }
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
