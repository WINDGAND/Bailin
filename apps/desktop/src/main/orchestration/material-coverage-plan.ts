import type { DistillationJobConfig } from "@nuwa-pet/character-protocol";
import {
  agentNameForSlug,
  buildMaterialCoveragePrompt,
  parseMaterialCoverage,
  slugForAgentId,
  type MaterialCoverageResult,
  RESEARCH_AGENT_ORDER,
  type ResearchAgentSlug
} from "@nuwa-pet/nuwa-prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import type { AgentResearchPlan } from "./research-pipeline.js";

/** 创建页建议条阈值：素材超过此字数且仍为 web 时，推荐（非强制）本地优先。 */
export const LOCAL_FIRST_SUGGEST_MIN_CHARS = 600;

/** 原创角色纯本地建议阈值。 */
export const LOCAL_ONLY_SUGGEST_MIN_CHARS = 200;

/** covered 摘要低于此长度时降级为 partial（走不联网 LLM 整理）。 */
export const MIN_COVERED_SUMMARY_CHARS = 400;

export type EffectiveMaterialMode = "web" | "local-first" | "local-only";

export function resolveEffectiveMaterialMode(config: DistillationJobConfig): EffectiveMaterialMode {
  if (config.materialMode === "local-only") return "local-only";
  if (!config.enableWebSearch) return "local-only";
  if (config.materialMode === "local-first") return "local-first";
  return "web";
}

export async function classifyMaterialCoverage(
  llm: LLMAdapter,
  config: DistillationJobConfig
): Promise<MaterialCoverageResult | null> {
  const material = config.userMaterial?.trim();
  if (!material || material.length < 80) return null;

  const { system, user } = buildMaterialCoveragePrompt({
    characterName: config.characterName,
    sourceType: config.sourceType,
    userMaterial: material
  });

  const r = await llm.chatOnce({
    systemPrompt: system,
    messages: [{ role: "user", content: user }],
    temperature: 0.1,
    maxTokens: 4500,
    stream: false
  });

  if (r.kind === "error") return null;
  return parseMaterialCoverage(r.text);
}

export interface AgentPlansFromCoverageResult {
  plans: AgentResearchPlan[];
  /** covered 因摘要过短被降级为 partial 的 Agent 编号。 */
  downgradedAgentIds: Array<1 | 2 | 3 | 4 | 5 | 6>;
}

export function buildAgentPlansFromCoverage(
  coverage: MaterialCoverageResult,
  enableWebSearch: boolean
): AgentPlansFromCoverageResult {
  const plans: AgentResearchPlan[] = [];
  const downgradedAgentIds: Array<1 | 2 | 3 | 4 | 5 | 6> = [];

  for (const slug of RESEARCH_AGENT_ORDER) {
    const id = RESEARCH_AGENT_ORDER.indexOf(slug) + 1 as 1 | 2 | 3 | 4 | 5 | 6;
    const summary = coverage.localSummaries[id];

    if (coverage.coveredAgentIds.includes(id) && summary) {
      if (summary.length < MIN_COVERED_SUMMARY_CHARS) {
        downgradedAgentIds.push(id);
        plans.push({
          slug,
          webSearchEnabled: false,
          skipRun: false,
          localMaterialFocus: summary
        });
        continue;
      }
      plans.push({
        slug,
        webSearchEnabled: false,
        skipRun: true,
        localMarkdown: ensureLocalDocHeader(summary, slug)
      });
      continue;
    }

    if (coverage.partialAgentIds.includes(id)) {
      plans.push({
        slug,
        webSearchEnabled: false,
        skipRun: false,
        localMaterialFocus: summary ?? undefined
      });
      continue;
    }

    plans.push({
      slug,
      webSearchEnabled: enableWebSearch && coverage.gapAgentIds.includes(id)
    });
  }

  return { plans, downgradedAgentIds };
}

export function buildLocalOnlyAgentPlans(): AgentResearchPlan[] {
  return RESEARCH_AGENT_ORDER.map((slug) => ({
    slug,
    webSearchEnabled: false,
    skipRun: false
  }));
}

export function buildWebAgentPlans(enableWebSearch: boolean): AgentResearchPlan[] {
  return RESEARCH_AGENT_ORDER.map((slug) => ({
    slug,
    webSearchEnabled: enableWebSearch,
    skipRun: false
  }));
}

export function anyAgentNeedsWebSearch(plans: AgentResearchPlan[]): boolean {
  return plans.some((p) => p.webSearchEnabled && !p.skipRun);
}

export function formatCoveragePlanMessage(
  mode: EffectiveMaterialMode,
  coverage: MaterialCoverageResult | null,
  plans: AgentResearchPlan[]
): string {
  if (mode === "local-only") {
    return "纯本地模式：6 路调研均不联网，仅使用你的素材与模型训练知识。";
  }
  if (mode !== "local-first" || !coverage) {
    return "启动 6 路并行调研…";
  }

  const skipped = plans.filter((p) => p.skipRun).map((p) => agentIdLabel(p.slug));
  const localOnly = plans.filter((p) => !p.skipRun && !p.webSearchEnabled).map((p) => agentIdLabel(p.slug));
  const web = plans.filter((p) => p.webSearchEnabled).map((p) => agentIdLabel(p.slug));

  const parts: string[] = ["本地素材优先："];
  if (skipped.length > 0) parts.push(`本地摘要 ${skipped.join("、")}`);
  if (localOnly.length > 0) parts.push(`本地整理 ${localOnly.join("、")}`);
  if (web.length > 0) parts.push(`联网补跑 ${web.join("、")}`);
  return parts.join("；");
}

function agentIdLabel(slug: ResearchAgentSlug): string {
  const id = RESEARCH_AGENT_ORDER.indexOf(slug) + 1;
  return `Agent ${id}`;
}

function ensureLocalDocHeader(markdown: string, slug: ResearchAgentSlug): string {
  const name = agentNameForSlug(slug);
  if (/^#\s/m.test(markdown) || /^##\s/m.test(markdown)) {
    return markdown;
  }
  return `## ${name}（用户一手素材）\n\n${markdown}`;
}

export function coverageSummaryForWarning(coverage: MaterialCoverageResult): string {
  const fmt = (ids: number[]) => ids.map((id) => {
    const slug = slugForAgentId(id);
    return slug ? `Agent ${id}` : `Agent ${id}`;
  }).join("、");

  return [
    `本地覆盖：${fmt(coverage.coveredAgentIds) || "无"}`,
    `部分覆盖：${fmt(coverage.partialAgentIds) || "无"}`,
    `需联网：${fmt(coverage.gapAgentIds) || "无"}`
  ].join("；");
}
