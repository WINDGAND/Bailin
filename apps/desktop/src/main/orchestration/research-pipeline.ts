import type { ResearchAgentId, ResearchDoc } from "@nuwa-pet/character-protocol";
import {
  buildResearchAgentPrompt,
  RESEARCH_AGENT_ORDER,
  type ResearchAgentInput,
  type ResearchAgentSlug
} from "@nuwa-pet/nuwa-prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

const SLUG_TO_AGENT_ID: Record<ResearchAgentSlug, 1 | 2 | 3 | 4 | 5 | 6> = {
  writings: 1,
  conversations: 2,
  "expression-dna": 3,
  "external-views": 4,
  decisions: 5,
  timeline: 6
};

export const AGENT_ID_TO_SLUG: Record<1 | 2 | 3 | 4 | 5 | 6, ResearchAgentSlug> = {
  1: "writings",
  2: "conversations",
  3: "expression-dna",
  4: "external-views",
  5: "decisions",
  6: "timeline"
};

export function agentIdsToSlugs(ids: ResearchAgentId[]): ResearchAgentSlug[] {
  const slugs: ResearchAgentSlug[] = [];
  for (const id of ids) {
    const slug = AGENT_ID_TO_SLUG[id as 1 | 2 | 3 | 4 | 5 | 6];
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

export interface AgentResearchPlan {
  slug: ResearchAgentSlug;
  webSearchEnabled: boolean;
  /** 若 true，直接用 localMarkdown 落 doc，不调 LLM。 */
  skipRun?: boolean;
  localMarkdown?: string;
  /** partial 维度：注入该维度的本地摘要片段。 */
  localMaterialFocus?: string;
}

export interface RunResearchAgentsInput {
  characterName: string;
  sourceType: ResearchAgentInput["sourceType"];
  track: ResearchAgentInput["track"];
  userMaterial?: string;
  /**
   * 角色的原作上下文 / 消歧义锚点（如「进击的巨人」、「Berkshire Hathaway 副董事长」）。
   * 透传给 prompt，用于让 search-preview 模型能正确识别角色，
   * 避免「三笠 → 战舰」「绫波 → 驱逐舰」这种灾难性搜索结果。
   */
  sourceContext?: string;
  /** 角色的英文名 / 原名，用于多语言交叉搜索（如 "Mikasa Ackerman"）。 */
  englishName?: string;
  webSearchEnabled: boolean;
  /** 1..6，默认 2。 */
  concurrency: number;
  /** 单 agent 超时（毫秒），默认 5 分钟。 */
  timeoutMs: number;
  /**
   * 调研用的「内置联网模型」（仅在 webSearchEnabled=true 时使用）。
   * 例如 gpt-4o-mini-search-preview。空则用 provider 默认 model。
   */
  researchModel?: string;
  /** 上层订阅每个 agent 完成 / 失败的实时回调，UI 用来更新状态卡片。 */
  onAgentDone?: (doc: ResearchDoc) => void;
  /** 给上层透出每个 agent 开始时的事件。 */
  onAgentStart?: (slug: ResearchAgentSlug, agentName: string) => void;
  /** 仅跑指定 Agent（补调研）；默认跑全部 6 路。 */
  onlyAgents?: ResearchAgentSlug[];
  /** 每路 Agent 的联网 / 本地策略；缺省则全部使用 webSearchEnabled。 */
  agentPlans?: AgentResearchPlan[];
}

export interface RunResearchAgentsResult {
  docs: ResearchDoc[];
  okCount: number;
  failedCount: number;
  totalDurationMs: number;
}

/**
 * 6 路并行调研，节流到 concurrency 路同时跑，单 agent 失败不阻断其他。
 */
export async function runResearchAgents(
  llm: LLMAdapter,
  input: RunResearchAgentsInput
): Promise<RunResearchAgentsResult> {
  const startedAt = Date.now();
  const docs: ResearchDoc[] = [];
  const queue = input.onlyAgents?.length
    ? RESEARCH_AGENT_ORDER.filter((s) => input.onlyAgents!.includes(s))
    : [...RESEARCH_AGENT_ORDER];
  const inflight = new Set<Promise<void>>();
  const concurrency = Math.max(1, Math.min(6, input.concurrency));

  const runOne = async (slug: ResearchAgentSlug): Promise<void> => {
    const agentId = SLUG_TO_AGENT_ID[slug];
    const plan = input.agentPlans?.find((p) => p.slug === slug);
    const webForAgent = plan?.webSearchEnabled ?? input.webSearchEnabled;

    if (plan?.skipRun && plan.localMarkdown) {
      const agentName = buildResearchAgentPrompt(slug, {
        characterName: input.characterName,
        sourceType: input.sourceType,
        track: input.track,
        userMaterial: input.userMaterial,
        webSearchEnabled: false,
        sourceContext: input.sourceContext,
        englishName: input.englishName
      }).agentName;
      input.onAgentStart?.(slug, agentName);
      const doc: ResearchDoc = {
        agentId,
        agentName,
        markdown: plan.localMarkdown,
        sources: [],
        confidence: inferConfidence(plan.localMarkdown),
        webSearchUsed: false,
        durationMs: 0,
        status: "ok"
      };
      docs.push(doc);
      input.onAgentDone?.(doc);
      return;
    }

    const { system, user, agentName } = buildResearchAgentPrompt(slug, {
      characterName: input.characterName,
      sourceType: input.sourceType,
      track: input.track,
      userMaterial: input.userMaterial,
      webSearchEnabled: webForAgent,
      sourceContext: input.sourceContext,
      englishName: input.englishName,
      localMaterialFocus: plan?.localMaterialFocus
    });
    input.onAgentStart?.(slug, agentName);
    const agentStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    const requestLabel = `research:${slug}:${truncateForLabel(input.characterName)}`;
    try {
      const result = await llm.chatWithTools({
        systemPrompt: system,
        messages: [{ role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 4500,
        stream: false,
        signal: controller.signal,
        enableWebSearch: webForAgent,
        maxToolCalls: 6,
        modelOverride: webForAgent ? input.researchModel : undefined,
        searchContextSize: "medium",
        requestLabel
      });

      const durationMs = Date.now() - agentStartedAt;
      if (result.kind === "error") {
        const isTimeout = controller.signal.aborted;
        const safeMessage = researchErrorToUserMessage(result.message, isTimeout);
        const errLine = `[research-pipeline] ${requestLabel} FAILED kind=error code=${result.code} dt=${durationMs}ms`;
        console.warn(errLine);
        pipelineLog()?.warn(errLine);
        const doc: ResearchDoc = {
          agentId,
          agentName,
          markdown: `> ${safeMessage}`,
          sources: [],
          confidence: "low",
          webSearchUsed: false,
          durationMs,
          status: isTimeout ? "timeout" : "error",
          errorMessage: safeMessage
        };
        docs.push(doc);
        input.onAgentDone?.(doc);
        return;
      }

      const markdown = (result.text || "").trim();
      const sources = dedupe(result.citations);
      const confidence = inferConfidence(markdown);
      // 判定"真触发联网"：以 citations 为准（更稳健），同时兼容旧 toolEvents 信号。
      // 这样即使中转吞了 server_tool_use 块、但仍透传了 url_citation annotations，也算真联网。
      const webSearchUsed =
        sources.length > 0 || result.toolEvents.some((e) => e.kind === "tool_start");
      const okLine =
        `[research-pipeline] ${requestLabel} dt=${durationMs}ms textLen=${markdown.length} ` +
        `sources=${sources.length} webSearchUsed=${webSearchUsed} confidence=${confidence}`;
      console.log(okLine);
      pipelineLog()?.info(okLine);
      const doc: ResearchDoc = {
        agentId,
        agentName,
        markdown: markdown.length > 0 ? markdown : `> Agent ${agentId} 返回空内容`,
        sources,
        confidence,
        webSearchUsed,
        durationMs,
        status: markdown.length > 0 ? "ok" : "error",
        errorMessage: markdown.length === 0 ? "空 markdown" : undefined
      };
      docs.push(doc);
      input.onAgentDone?.(doc);
    } catch (e) {
      const safeMessage = researchErrorToUserMessage(
        e instanceof Error ? e.message : String(e),
        false
      );
      const doc: ResearchDoc = {
        agentId,
        agentName,
        markdown: `> ${safeMessage}`,
        sources: [],
        confidence: "low",
        webSearchUsed: false,
        durationMs: Date.now() - agentStartedAt,
        status: "error",
        errorMessage: safeMessage
      };
      docs.push(doc);
      input.onAgentDone?.(doc);
    } finally {
      clearTimeout(timer);
    }
  };

  while (queue.length > 0 || inflight.size > 0) {
    while (queue.length > 0 && inflight.size < concurrency) {
      const slug = queue.shift()!;
      const task = runOne(slug).finally(() => {
        inflight.delete(task);
      });
      inflight.add(task);
    }
    if (inflight.size > 0) {
      await Promise.race(inflight);
    }
  }

  docs.sort((a, b) => a.agentId - b.agentId);
  return {
    docs,
    okCount: docs.filter((d) => d.status === "ok").length,
    failedCount: docs.filter((d) => d.status !== "ok").length,
    totalDurationMs: Date.now() - startedAt
  };
}

function researchErrorToUserMessage(raw: string, timeout: boolean): string {
  if (timeout) {
    return "这一路调研响应太慢，已跳过。系统会用其他调研结果继续完成深度创建。";
  }
  if (/401|403|unauthorized|invalid api key|AUTH_FAILED/i.test(raw)) {
    return "模型 Key 无效或没有权限，这一路调研已跳过。";
  }
  if (/429|rate limit|RATE_LIMITED/i.test(raw)) {
    return "模型供应商临时限流，这一路调研已跳过。";
  }
  if (/search-preview|web_search|annotations|citation|url_citation|web_search_options|baseUrl/i.test(raw)) {
    return "这一路没有拿到可验证的网页来源，已降级为低可信调研。";
  }
  if (/abort|timeout|timed out/i.test(raw)) {
    return "这一路调研超时，已跳过。";
  }
  return `这一路调研失败：${raw.slice(0, 120)}`;
}

function truncateForLabel(s: string): string {
  return s.slice(0, 32).replace(/\s+/g, "_");
}

/**
 * 与 llm-adapter 一样的双通道日志：同时写 dev 终端和 %APPDATA%/Bailin/logs/main.log。
 * lazy require 是因为这个文件也被独立 verify 脚本 require（脚本里没有 Electron app）。
 */
let cachedPipelineLogger: { info: (s: string) => void; warn: (s: string) => void } | null = null;
function pipelineLog(): { info: (s: string) => void; warn: (s: string) => void } | null {
  if (cachedPipelineLogger) return cachedPipelineLogger;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const mod = require("electron-log/main") as {
      info: (s: string) => void;
      warn: (s: string) => void;
    };
    cachedPipelineLogger = mod;
    return cachedPipelineLogger;
  } catch {
    return null;
  }
}

function dedupe(arr: string[]): string[] {
  const set = new Set<string>();
  for (const s of arr) {
    if (typeof s === "string" && s.trim().length > 0) set.add(s.trim());
  }
  return Array.from(set);
}

function inferConfidence(markdown: string): "high" | "medium" | "low" {
  const lower = markdown.toLowerCase();
  const selfReportMatch = markdown.match(/confidence[\s:：]*([a-z]+)/i);
  if (selfReportMatch?.[1]) {
    const v = selfReportMatch[1].toLowerCase();
    if (v === "high" || v === "medium" || v === "low") return v;
  }
  const hasSources = /## 引用来源|http[s]?:\/\//i.test(markdown);
  if (markdown.length > 1500 && hasSources) return "high";
  if (markdown.length > 600 && hasSources) return "medium";
  if (lower.includes("基于训练知识") || !hasSources) return "low";
  return "medium";
}
