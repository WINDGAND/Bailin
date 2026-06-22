import { z } from "zod";

/**
 * ResearchDoc：百灵深度蒸馏 Phase·1（多 Agent 并行调研）每个 Agent 的产出。
 * 对应 huashu-nuwa SKILL.md 第 213 行附近的 6 维度调研。
 * 一次蒸馏 → 6 个 doc（按 agentId 1..6 区分）。
 */
export const RESEARCH_AGENT_IDS = [1, 2, 3, 4, 5, 6] as const;
export type ResearchAgentId = (typeof RESEARCH_AGENT_IDS)[number];

export const RESEARCH_AGENT_LABELS: Record<ResearchAgentId, { slug: string; cn: string; en: string }> = {
  1: { slug: "writings", cn: "著作", en: "Writings & Long-form" },
  2: { slug: "conversations", cn: "对话", en: "Conversations & Interviews" },
  3: { slug: "expression-dna", cn: "表达 DNA", en: "Expression DNA" },
  4: { slug: "external-views", cn: "他者视角", en: "External Views" },
  5: { slug: "decisions", cn: "决策记录", en: "Decisions & Actions" },
  6: { slug: "timeline", cn: "时间线", en: "Timeline" }
};

export const ResearchDocSchema = z.object({
  agentId: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6)
  ]),
  agentName: z.string().min(1).max(80),
  /** Agent 原始 Markdown 输出，含小节、表格、来源标注。建议 ≤ 8000 字符。 */
  markdown: z.string().min(1).max(20000),
  /** Agent 在搜索时拿到的引用 URL，按出现顺序去重。 */
  sources: z.array(z.string().url()).default([]),
  /** Agent 自评：信息是否充足，是否大量靠推测。 */
  confidence: z.enum(["high", "medium", "low"]),
  /** Agent 是否在调研阶段实际触发了 web_search。 */
  webSearchUsed: z.boolean().default(false),
  /** Agent 调用耗时（毫秒），用于 UI 展示「研究 X 秒」。 */
  durationMs: z.number().int().nonnegative().default(0),
  /** Agent 退出原因：normal 正常；timeout 超时；error 模型/网络错。 */
  status: z.enum(["ok", "timeout", "error", "skipped"]).default("ok"),
  /** 错误时的简短说明，UI 标红。 */
  errorMessage: z.string().max(500).optional()
});

export type ResearchDoc = z.infer<typeof ResearchDocSchema>;

/** 一次完整调研的汇总，对应百灵 Phase 1.5 检查点要展示给用户的内容。 */
export const ResearchSummarySchema = z.object({
  jobId: z.string().min(1),
  docs: z.array(ResearchDocSchema).max(6),
  /** 至少几个 agent 成功，外层用来决定是否进 Phase 2。 */
  okCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  /** 全部 agent 调用总耗时（最长那个，因为是并发）。 */
  totalDurationMs: z.number().int().nonnegative()
});

export type ResearchSummary = z.infer<typeof ResearchSummarySchema>;
