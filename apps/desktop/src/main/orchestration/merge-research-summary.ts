import type { ResearchDoc } from "@bailin/character-protocol";
import type {
  MaterialModeUsed,
  ResearchReviewAgentRow,
  ResearchReviewPayload
} from "../../shared/ipc-contract.js";

const CONTRADICTION_PATTERN =
  /(?:矛盾|相反|但实际上|然而.*?不同|争议|冲突|不一致).{0,100}/g;

const PRIMARY_MARKERS = /一手|primary|本人|原文|原始|直接引用/gi;
const SECONDARY_MARKERS = /二手|secondary|转述|总结|评论|分析/gi;
const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;

/**
 * 合并 6 份调研 doc，生成 Phase 1.5 checkpoint 用的结构化 Review。
 * 纯本地启发式，不调用 LLM。
 */
export function mergeResearchSummary(
  docs: ResearchDoc[],
  materialModeUsed: MaterialModeUsed = "web"
): ResearchReviewPayload {
  const sorted = [...docs].sort((a, b) => a.agentId - b.agentId);
  const allUrls = new Set<string>();
  let primaryMarkerTotal = 0;
  let secondaryMarkerTotal = 0;
  const contradictions: string[] = [];

  const agents: ResearchReviewAgentRow[] = sorted.map((doc) => {
    const markdown = doc.markdown ?? "";
    const urlMatches = markdown.match(URL_PATTERN) ?? [];
    const uniqueUrls = new Set(urlMatches.map((u) => u.replace(/[.,;]+$/, "")));
    for (const u of uniqueUrls) allUrls.add(u);

    const primaryMarkerCount = countMatches(markdown, PRIMARY_MARKERS);
    const secondaryMarkerCount = countMatches(markdown, SECONDARY_MARKERS);
    primaryMarkerTotal += primaryMarkerCount;
    secondaryMarkerTotal += secondaryMarkerCount;

    const localContradictions = markdown.match(CONTRADICTION_PATTERN) ?? [];
    for (const m of localContradictions.slice(0, 3)) {
      contradictions.push(`${doc.agentName}: ${m.trim().slice(0, 100)}`);
    }

    return {
      agentId: doc.agentId,
      agentName: doc.agentName,
      status: doc.status,
      confidence: doc.confidence,
      webSearchUsed: doc.webSearchUsed,
      uniqueUrlCount: uniqueUrls.size,
      primaryMarkerCount,
      secondaryMarkerCount,
      keyFindings: extractKeyFindings(markdown)
    };
  });

  const localMaterialAgentCount = agents.filter(
    (a) => a.status === "ok" && !a.webSearchUsed
  ).length;

  const weakDimensions = agents
    .filter((a) => isWeakDimension(a))
    .map((a) => a.agentName);

  const markerSum = primaryMarkerTotal + secondaryMarkerTotal;
  const primaryRatioLabel =
    markerSum > 0 ? `${primaryMarkerTotal}/${markerSum}` : "未标记";

  const isLocalMode = materialModeUsed === "local-first" || materialModeUsed === "local-only";
  const lowSourceWarning = !isLocalMode && allUrls.size < 10;

  const gapResearchWarning =
    materialModeUsed === "local-first" &&
    agents.some(
      (a) =>
        a.webSearchUsed &&
        (a.status !== "ok" || a.confidence === "low" || a.uniqueUrlCount === 0)
    );

  return {
    agents,
    totalUniqueUrls: allUrls.size,
    primaryMarkerTotal,
    secondaryMarkerTotal,
    primaryRatioLabel,
    contradictions: contradictions.slice(0, 8),
    weakDimensions,
    lowSourceWarning,
    localMaterialAgentCount,
    gapResearchWarning
  };
}

function isWeakDimension(a: ResearchReviewAgentRow): boolean {
  if (a.status !== "ok") return true;
  if (a.confidence === "low") return true;
  // 本地摘要 Agent 无 URL 是预期行为
  if (!a.webSearchUsed && a.status === "ok") return false;
  if (a.uniqueUrlCount === 0 && a.status === "ok") return true;
  return false;
}

/** 补跑后合并：新 doc 按 agentId 覆盖旧 doc。 */
export function mergeResearchDocs(
  existing: ResearchDoc[],
  updated: ResearchDoc[]
): ResearchDoc[] {
  const byId = new Map<number, ResearchDoc>();
  for (const d of existing) byId.set(d.agentId, d);
  for (const d of updated) byId.set(d.agentId, d);
  return Array.from(byId.values()).sort((a, b) => a.agentId - b.agentId);
}

export function summarizeResearchRun(docs: ResearchDoc[]): {
  okCount: number;
  failedCount: number;
} {
  return {
    okCount: docs.filter((d) => d.status === "ok").length,
    failedCount: docs.filter((d) => d.status !== "ok").length
  };
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function extractKeyFindings(content: string, maxItems = 3): string[] {
  const headings = content.match(/^##\s+(.+)$/gm);
  if (headings && headings.length > 0) {
    return headings.slice(0, maxItems).map((h) => h.replace(/^##\s+/, "").trim());
  }
  const bolds = content.match(/\*\*(.+?)\*\*/g);
  if (bolds && bolds.length > 0) {
    return bolds.slice(0, maxItems).map((b) => b.replace(/\*\*/g, "").trim());
  }
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith(">"));
  return lines.slice(0, maxItems).map((l) => (l.length > 50 ? `${l.slice(0, 47)}…` : l));
}
