/**
 * 角色蒸馏的 6 路调研流水线：按 Agent 槽位并行调 LLM，产出 `ResearchDoc[]`。
 *
 * 支持全量跑或 `onlyAgents` 补调研；每路可按 `AgentResearchPlan` 跳过 LLM、直接落本地
 * markdown，或注入 `localMaterialFocus`。并发节流、单路超时与用户取消互不影响其它路。
 * 本文件只产调研文档，不写角色包、不跑合成。
 */
import type { ResearchAgentId, ResearchDoc } from "@bailin/character-protocol";
import {
  buildResearchAgentPrompt,
  RESEARCH_AGENT_ORDER,
  type ResearchAgentInput,
  type ResearchAgentSlug
} from "@bailin/prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";

/** slug → 协议里的 1..6 槽位；与 `AGENT_ID_TO_SLUG` 互为反查。 */
const SLUG_TO_AGENT_ID: Record<ResearchAgentSlug, 1 | 2 | 3 | 4 | 5 | 6> = {
  writings: 1,
  conversations: 2,
  "expression-dna": 3,
  "external-views": 4,
  decisions: 5,
  timeline: 6
};

/** 协议槽位 1..6 → 调研 Agent slug（writings / conversations / …）。 */
export const AGENT_ID_TO_SLUG: Record<1 | 2 | 3 | 4 | 5 | 6, ResearchAgentSlug> = {
  1: "writings",
  2: "conversations",
  3: "expression-dna",
  4: "external-views",
  5: "decisions",
  6: "timeline"
};

/**
 * 把协议里的 Agent 槽位 ID 转成 slug，去重且保持传入顺序。
 *
 * 未知 ID 静默跳过（`AGENT_ID_TO_SLUG` 查不到则忽略），不抛错。
 *
 * @param ids 调研 Agent 槽位（1..6）
 * @returns 对应 slug 列表；无副作用
 */
export function agentIdsToSlugs(ids: ResearchAgentId[]): ResearchAgentSlug[] {
  const slugs: ResearchAgentSlug[] = [];
  for (const id of ids) {
    const slug = AGENT_ID_TO_SLUG[id as 1 | 2 | 3 | 4 | 5 | 6];
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

/**
 * 单路调研的联网 / 本地策略，由素材覆盖规划生成。
 * 缺省时该路沿用 `RunResearchAgentsInput.webSearchEnabled`。
 */
export interface AgentResearchPlan {
  slug: ResearchAgentSlug;
  webSearchEnabled: boolean;
  /** 若 true，直接用 `localMarkdown` 落 doc，不调 LLM。 */
  skipRun?: boolean;
  localMarkdown?: string;
  /** partial 维度：注入该维度的本地摘要片段。 */
  localMaterialFocus?: string;
}

/**
 * `runResearchAgents` 的入参：角色锚点、并发/超时、每路计划与进度回调。
 * `onAgentStart` / `onAgentDone` 仅通知 UI，不改变流水线结果。
 */
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
  /** 用户取消蒸馏时传入；会与单 agent 超时 signal 合并。 */
  signal?: AbortSignal;
}

/**
 * 一轮调研的汇总。`docs` 按 `agentId` 升序；`failedCount` 含 error / timeout / 空内容。
 * 取消后可能少于计划路数（已中止的路不入 docs）。
 */
export interface RunResearchAgentsResult {
  docs: ResearchDoc[];
  okCount: number;
  failedCount: number;
  totalDurationMs: number;
}

/**
 * 按队列并行跑调研 Agent，节流到 `concurrency` 路同时执行；单路失败不阻断其它路。
 *
 * `skipRun + localMarkdown` 的路不调 LLM，直接落本地文档。用户 `signal` 中止时清空剩余队列，
 * 已在飞的任务靠合并后的 AbortSignal 尽快结束。副作用：打 LLM、写 console / electron-log。
 *
 * @param llm 对话适配器；联网调研走 `chatWithTools`
 * @param input 角色锚点、并发、超时、可选补跑列表与每路计划
 * @returns 按 `agentId` 排序的文档及成功/失败计数
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
    if (input.signal?.aborted) return;

    const agentId = SLUG_TO_AGENT_ID[slug];
    const plan = input.agentPlans?.find((p) => p.slug === slug);
    const webForAgent = plan?.webSearchEnabled ?? input.webSearchEnabled;

    // 规划判定该路已被本地素材覆盖：不调 LLM，按本地 markdown 直接记一条 ok 文档
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
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), input.timeoutMs);
    const signal = mergeAbortSignals(input.signal, timeoutCtl.signal);

    const requestLabel = `research:${slug}:${truncateForLabel(input.characterName)}`;
    try {
      const result = await llm.chatWithTools({
        systemPrompt: system,
        messages: [{ role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 4500,
        stream: false,
        signal,
        enableWebSearch: webForAgent,
        maxToolCalls: 6,
        modelOverride: webForAgent ? input.researchModel : undefined,
        searchContextSize: "medium",
        requestLabel
      });

      const durationMs = Date.now() - agentStartedAt;
      // 用户取消优先于超时：已中止则丢弃本路结果，不写入 docs
      if (input.signal?.aborted) return;
      if (result.kind === "error") {
        const isTimeout = timeoutCtl.signal.aborted && !input.signal?.aborted;
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
      if (input.signal?.aborted) return;
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

  // 工作池：队列未空且未达并发上限就开工；取消时丢掉剩余 slug，只等已在飞的任务收尾
  while (queue.length > 0 || inflight.size > 0) {
    if (input.signal?.aborted) {
      queue.length = 0;
      if (inflight.size === 0) break;
      await Promise.race(inflight);
      continue;
    }
    while (queue.length > 0 && inflight.size < concurrency) {
      if (input.signal?.aborted) break;
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

/** 把适配器/超时原文收成对用户可见的短句，避免把 Key、堆栈或供应商 HTML 透出。 */
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

/** 角色名压成日志标签片段：最长 32 字，空白改下划线。 */
function truncateForLabel(s: string): string {
  return s.slice(0, 32).replace(/\s+/g, "_");
}

/**
 * 合并用户取消与单路超时：任一 abort 即中止本路 LLM 调用。
 * 优先用 `AbortSignal.any`；旧运行时退化为手动 AbortController。
 */
function mergeAbortSignals(
  userSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal
): AbortSignal {
  if (!userSignal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([userSignal, timeoutSignal]);
  }
  const ac = new AbortController();
  const abort = (): void => ac.abort();
  if (userSignal.aborted || timeoutSignal.aborted) {
    ac.abort();
    return ac.signal;
  }
  userSignal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return ac.signal;
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

/** 引用 URL 去空白后去重，丢掉空串。 */
function dedupe(arr: string[]): string[] {
  const set = new Set<string>();
  for (const s of arr) {
    if (typeof s === "string" && s.trim().length > 0) set.add(s.trim());
  }
  return Array.from(set);
}

/**
 * 从 markdown 推断可信度：优先信模型自报的 confidence，否则按篇幅 + 是否有引用来源分层。
 * 自报非法值或未自报时，无来源 / 「基于训练知识」一律 low。
 */
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
