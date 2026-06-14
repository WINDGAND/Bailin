import type { ResearchDoc } from "@nuwa-pet/character-protocol";
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

export interface RunResearchAgentsInput {
  characterName: string;
  sourceType: ResearchAgentInput["sourceType"];
  track: ResearchAgentInput["track"];
  userMaterial?: string;
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
  const queue = [...RESEARCH_AGENT_ORDER];
  const inflight = new Set<Promise<void>>();
  const concurrency = Math.max(1, Math.min(6, input.concurrency));

  const runOne = async (slug: ResearchAgentSlug): Promise<void> => {
    const agentId = SLUG_TO_AGENT_ID[slug];
    const { system, user, agentName } = buildResearchAgentPrompt(slug, {
      characterName: input.characterName,
      sourceType: input.sourceType,
      track: input.track,
      userMaterial: input.userMaterial,
      webSearchEnabled: input.webSearchEnabled
    });
    input.onAgentStart?.(slug, agentName);
    const agentStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const result = await llm.chatWithTools({
        systemPrompt: system,
        messages: [{ role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 4500,
        stream: false,
        signal: controller.signal,
        enableWebSearch: input.webSearchEnabled,
        maxToolCalls: 6,
        modelOverride: input.webSearchEnabled ? input.researchModel : undefined,
        searchContextSize: "medium"
      });

      const durationMs = Date.now() - agentStartedAt;
      if (result.kind === "error") {
        const isTimeout = controller.signal.aborted;
        const doc: ResearchDoc = {
          agentId,
          agentName,
          markdown: `> Agent ${agentId} (${agentName}) ${isTimeout ? "超时" : "失败"}：${result.message}`,
          sources: [],
          confidence: "low",
          webSearchUsed: false,
          durationMs,
          status: isTimeout ? "timeout" : "error",
          errorMessage: result.message
        };
        docs.push(doc);
        input.onAgentDone?.(doc);
        return;
      }

      const markdown = (result.text || "").trim();
      const sources = dedupe(result.citations);
      const confidence = inferConfidence(markdown);
      const webSearchUsed = result.toolEvents.some((e) => e.kind === "tool_start");
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
      const doc: ResearchDoc = {
        agentId,
        agentName,
        markdown: `> Agent ${agentId} 异常：${e instanceof Error ? e.message : String(e)}`,
        sources: [],
        confidence: "low",
        webSearchUsed: false,
        durationMs: Date.now() - agentStartedAt,
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e)
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
