/**
 * 蒸馏任务的素材覆盖规划：决定 6 路调研 Agent 跳过、纯本地整理还是联网补跑。
 *
 * 创建页的 `materialMode` / `enableWebSearch` 会先收成有效模式；`local-first` 再让 LLM
 * 判断用户素材对各 Agent 的覆盖度，据此生成 `AgentResearchPlan` 与进度条文案。
 * 本文件只做规划与文案，不发起调研、不写角色包。
 */
import type { DistillationJobConfig } from "@bailin/character-protocol";
import {
  agentNameForSlug,
  buildMaterialCoveragePrompt,
  parseMaterialCoverage,
  slugForAgentId,
  type MaterialCoverageResult,
  RESEARCH_AGENT_ORDER,
  type ResearchAgentSlug
} from "@bailin/prompts";
import type { LLMAdapter } from "../adapters/llm-adapter.js";
import type { AgentResearchPlan } from "./research-pipeline.js";

/** 创建页建议条阈值：素材超过此字数且仍为 web 时，推荐（非强制）本地优先。 */
export const LOCAL_FIRST_SUGGEST_MIN_CHARS = 600;

/** 原创角色纯本地建议阈值。 */
export const LOCAL_ONLY_SUGGEST_MIN_CHARS = 200;

/** covered 摘要低于此长度时降级为 partial（走不联网 LLM 整理）。 */
export const MIN_COVERED_SUMMARY_CHARS = 400;

/**
 * 编排实际生效的素材模式。
 * 与创建页选项同名，但会因关掉联网搜索而被强制成 `local-only`。
 */
export type EffectiveMaterialMode = "web" | "local-first" | "local-only";

/**
 * 把蒸馏配置收成实际生效的素材模式。
 *
 * 显式 `local-only` 最高优先；`enableWebSearch === false` 时一律视为纯本地
 *（即使 UI 选了 web / local-first）。其余才尊重 `local-first`，默认 `web`。
 *
 * @param config 蒸馏任务配置
 * @returns 编排器用的有效模式；纯函数，无副作用
 */
export function resolveEffectiveMaterialMode(config: DistillationJobConfig): EffectiveMaterialMode {
  if (config.materialMode === "local-only") return "local-only";
  // 关掉联网后 web / local-first 都无法补搜，与纯本地等价
  if (!config.enableWebSearch) return "local-only";
  if (config.materialMode === "local-first") return "local-first";
  return "web";
}

/**
 * 调用 LLM 判断用户素材对各调研 Agent 的覆盖度。
 *
 * 素材缺省或去空白后不足 80 字时直接返回 `null`（不够分类，调用方走默认计划）。
 * 模型出错同样返回 `null`，不抛异常。
 *
 * @param llm 对话适配器；本函数只打一次非流式请求
 * @param config 取角色名、来源类型与用户素材
 * @returns 解析后的覆盖结果；无法分类时为 `null`
 */
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

/** 按覆盖分类生成的 6 路计划，以及因摘要过短从 covered 降级的 Agent。 */
export interface AgentPlansFromCoverageResult {
  plans: AgentResearchPlan[];
  /** covered 因摘要过短被降级为 partial 的 Agent 编号。 */
  downgradedAgentIds: Array<1 | 2 | 3 | 4 | 5 | 6>;
}

/**
 * 按覆盖分类生成 6 路调研计划。
 *
 * 对每个 Agent：
 * - covered 且摘要够长：`skipRun`，把摘要写成带标题的本地文档，不再跑调研
 * - covered 但摘要过短：降级为 partial，关闭联网、仍跑一轮本地整理
 * - partial：关闭联网，带着本地焦点再整理
 * - 其余（gap）：仅当 `enableWebSearch` 且该 Agent 在 gap 列表时才联网
 *
 * @param coverage LLM 覆盖分类
 * @param enableWebSearch 任务是否允许联网；false 时 gap 也不开 `webSearchEnabled`
 * @returns 6 路计划与被降级的 Agent 编号
 */
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
      // 摘要过短：不算真正 covered，降级为本地整理以免跳过调研
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

/**
 * 纯本地模式的默认 6 路计划：全部关闭联网、全部实际跑调研。
 *
 * @returns 与 `RESEARCH_AGENT_ORDER` 对齐的计划数组
 */
export function buildLocalOnlyAgentPlans(): AgentResearchPlan[] {
  return RESEARCH_AGENT_ORDER.map((slug) => ({
    slug,
    webSearchEnabled: false,
    skipRun: false
  }));
}

/**
 * web 模式的默认 6 路计划：是否联网跟随 `enableWebSearch`，全部实际跑调研。
 *
 * @param enableWebSearch 为 false 时 6 路都不联网（与纯本地计划等价，但语义上仍是 web 路径的降级）
 */
export function buildWebAgentPlans(enableWebSearch: boolean): AgentResearchPlan[] {
  return RESEARCH_AGENT_ORDER.map((slug) => ({
    slug,
    webSearchEnabled: enableWebSearch,
    skipRun: false
  }));
}

/**
 * 是否还有 Agent 需要真正发起联网搜索。
 * 已 `skipRun` 的不算，即使其 `webSearchEnabled` 曾为 true。
 */
export function anyAgentNeedsWebSearch(plans: AgentResearchPlan[]): boolean {
  return plans.some((p) => p.webSearchEnabled && !p.skipRun);
}

/**
 * 进度条 / 日志用的覆盖计划一句话。
 *
 * `local-only` 固定文案；非 local-first 或没有覆盖结果时用通用「启动 6 路」；
 * local-first 则按跳过 / 本地整理 / 联网补跑分段拼接。
 *
 * @param mode 有效素材模式
 * @param coverage local-first 下的覆盖分类；其它模式可传 `null`
 * @param plans 已生成的 6 路计划
 */
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
  // 已有标题则原样写入，避免套两层「用户一手素材」头
  if (/^#\s/m.test(markdown) || /^##\s/m.test(markdown)) {
    return markdown;
  }
  return `## ${name}（用户一手素材）\n\n${markdown}`;
}

/**
 * 把覆盖分类收成警告条用的短摘要（本地覆盖 / 部分覆盖 / 需联网）。
 *
 * @param coverage LLM 覆盖分类
 * @returns 分号拼接的三段中文；空列表显示「无」
 */
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
