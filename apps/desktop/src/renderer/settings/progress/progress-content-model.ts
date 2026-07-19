import type {
  HatchPetRowState,
  QualityReport,
  ResearchAgentId,
  ResearchDoc
} from "@bailin/character-protocol";
import { HATCH_PET_ROW_STATES } from "@bailin/character-protocol";
import type {
  DistillationProgressEvent,
  HatchProgressEventDTO,
  SynthesisSummaryPayload
} from "../../../shared/ipc-contract.js";

export interface AgentCardState {
  agentId: ResearchAgentId;
  agentName: string;
  status: "pending" | "running" | "ok" | "timeout" | "error" | "skipped" | "cancelled";
  durationMs?: number;
  webSearchUsed?: boolean;
  confidence?: "high" | "medium" | "low";
  sourcesCount?: number;
  errorMessage?: string;
  excerpt?: string;
}

export const INITIAL_AGENTS: AgentCardState[] = [
  { agentId: 1, agentName: "", status: "pending" },
  { agentId: 2, agentName: "", status: "pending" },
  { agentId: 3, agentName: "", status: "pending" },
  { agentId: 4, agentName: "", status: "pending" },
  { agentId: 5, agentName: "", status: "pending" },
  { agentId: 6, agentName: "", status: "pending" }
];

export type HatchJobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "mirrored"
  | "cancelled";

export interface HatchJobState {
  jobId: string;
  rowState: HatchPetRowState | "base";
  status: HatchJobStatus;
  durationMs?: number;
  costUsd?: number;
  reason?: string;
  mirroredFrom?: string;
}

export interface HatchPanelState {
  started: boolean;
  jobsCount?: number;
  estimatedCostUsd: number;
  totalCostUsd: number;
  atlasOk?: boolean;
  atlasIssues?: string[];
  contactSheetPath?: string;
  previewPath?: string;
  atlasPath?: string;
  jobs: Record<string, HatchJobState>;
}

export const INITIAL_HATCH_STATE: HatchPanelState = {
  started: false,
  jobs: {},
  totalCostUsd: 0,
  estimatedCostUsd: 0
};

export interface ProgressContentState {
  agents: AgentCardState[];
  warnings: string[];
  synthSummary: SynthesisSummaryPayload | null;
  qualityReport: QualityReport | null;
  appearanceReady: boolean;
  hatchState: HatchPanelState;
  doneCharacterId: string | null;
}

export const INITIAL_PROGRESS_CONTENT: ProgressContentState = {
  agents: INITIAL_AGENTS,
  warnings: [],
  synthSummary: null,
  qualityReport: null,
  appearanceReady: false,
  hatchState: INITIAL_HATCH_STATE,
  doneCharacterId: null
};

function agentFromDoc(doc: ResearchDoc, prev: AgentCardState): AgentCardState {
  return {
    agentId: prev.agentId,
    agentName: doc.agentName,
    status: doc.status === "ok" ? "ok" : doc.status,
    durationMs: doc.durationMs,
    webSearchUsed: doc.webSearchUsed,
    confidence: doc.confidence,
    sourcesCount: doc.sources.length,
    errorMessage: doc.errorMessage,
    excerpt: doc.markdown?.slice?.(0, 240)
  };
}

export function reduceHatch(
  state: HatchPanelState,
  evt: HatchProgressEventDTO
): HatchPanelState {
  switch (evt.kind) {
    case "start": {
      const initialJobs: Record<string, HatchJobState> = {
        base: { jobId: "base", rowState: "base", status: "pending" }
      };
      for (const row of HATCH_PET_ROW_STATES) {
        initialJobs[`row-${row}`] = {
          jobId: `row-${row}`,
          rowState: row,
          status: "pending"
        };
      }
      return {
        ...state,
        started: true,
        jobsCount: evt.jobsCount,
        estimatedCostUsd: evt.estimatedCostUsd,
        jobs: initialJobs
      };
    }
    case "job_start":
      return {
        ...state,
        // 中途才挂上监听时可能错过 start；任何 hatch 事件都应让面板可见
        started: true,
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: evt.rowState as HatchPetRowState | "base",
            status: "running"
          }
        }
      };
    case "job_done":
      return {
        ...state,
        started: true,
        totalCostUsd: state.totalCostUsd + (evt.costUsd ?? 0),
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: evt.rowState as HatchPetRowState | "base",
            status: "done",
            durationMs: evt.durationMs,
            costUsd: evt.costUsd
          }
        }
      };
    case "job_failed":
      return {
        ...state,
        started: true,
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: evt.rowState as HatchPetRowState | "base",
            status: "failed",
            reason: evt.reason
          }
        }
      };
    case "job_mirrored":
      return {
        ...state,
        started: true,
        jobs: {
          ...state.jobs,
          [evt.jobId]: {
            jobId: evt.jobId,
            rowState: (evt.jobId.replace(/^row-/, "") as HatchPetRowState) ?? "base",
            status: "mirrored",
            mirroredFrom: evt.from
          }
        }
      };
    case "atlas_composed":
      return {
        ...state,
        started: true,
        atlasOk: evt.ok,
        atlasIssues: evt.issuesPreview
      };
    case "qa_ready":
      return {
        ...state,
        started: true,
        contactSheetPath: evt.contactSheetPath,
        previewPath: evt.previewPath,
        atlasPath: evt.atlasPath
      };
    default:
      return state;
  }
}

/**
 * 用户点取消时立刻冻结内容区：停掉调研/生图转圈，避免终态已是「已取消」但子项仍显示研究中。
 */
export function freezeProgressContentOnCancel(
  state: ProgressContentState
): ProgressContentState {
  const agents = state.agents.map((a) =>
    a.status === "pending" || a.status === "running"
      ? { ...a, status: "cancelled" as const }
      : a
  );

  const jobs: Record<string, HatchJobState> = {};
  for (const [id, job] of Object.entries(state.hatchState.jobs)) {
    jobs[id] =
      job.status === "pending" || job.status === "running"
        ? { ...job, status: "cancelled", reason: "cancelled" }
        : job;
  }

  return {
    ...state,
    agents,
    hatchState: { ...state.hatchState, jobs }
  };
}

/**
 * 累加进度页内容区状态。与 stageDisplay 一样挂在 Provider 上，
 * 切设置 tab 卸载进度页后切回时仍能看到步骤 4/5 等内容。
 */
export function reduceProgressContent(
  state: ProgressContentState,
  evt: DistillationProgressEvent
): ProgressContentState {
  switch (evt.kind) {
    case "agent_start":
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.agentId === evt.agentId
            ? { ...a, status: "running", agentName: evt.agentName }
            : a
        )
      };
    case "agent_done":
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.agentId === evt.doc.agentId ? agentFromDoc(evt.doc, a) : a
        )
      };
    case "synthesis_summary":
      return { ...state, synthSummary: evt.summary };
    case "appearance_ready":
      return { ...state, appearanceReady: true };
    case "quality_report":
      return { ...state, qualityReport: evt.report };
    case "hatch_progress":
      return { ...state, hatchState: reduceHatch(state.hatchState, evt.event) };
    case "warning":
      return { ...state, warnings: [...state.warnings, evt.message] };
    case "done":
      return { ...state, doneCharacterId: evt.characterId };
    default:
      return state;
  }
}
