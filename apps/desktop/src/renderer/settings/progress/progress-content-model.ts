/**
 * 深度蒸馏进度页内容区的纯 reducer。
 *
 * 把主进程推来的 `DistillationProgressEvent` 折成可渲染的调研卡片、
 * hatch 生图面板与质量报告。状态挂在 DistillationJobProvider 上，
 * 切走设置 tab 卸载进度页后再回来仍能看到步骤内容。本文件无 IPC、无 DOM。
 */
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

/** 进度页上一张调研 Agent 卡片的展示态。 */
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

/** Phase 1 六路调研的空卡片占位，下标与 `agentId` 1..6 对齐。 */
export const INITIAL_AGENTS: AgentCardState[] = [
  { agentId: 1, agentName: "", status: "pending" },
  { agentId: 2, agentName: "", status: "pending" },
  { agentId: 3, agentName: "", status: "pending" },
  { agentId: 4, agentName: "", status: "pending" },
  { agentId: 5, agentName: "", status: "pending" },
  { agentId: 6, agentName: "", status: "pending" }
];

/** 单行 atlas 生图（或 base 立绘）的生命周期。`mirrored` 表示由对向行镜像，未真正调生图。 */
export type HatchJobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "mirrored"
  | "cancelled";

/** 进度页 hatch 面板里一行 job 的展示数据。 */
export interface HatchJobState {
  jobId: string;
  rowState: HatchPetRowState | "base";
  status: HatchJobStatus;
  durationMs?: number;
  costUsd?: number;
  reason?: string;
  mirroredFrom?: string;
}

/** hatch-pet 生图阶段整块面板的累加状态（成本、atlas 校验、QA 路径）。 */
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

/** 尚未收到任何 hatch 事件时的空面板。 */
export const INITIAL_HATCH_STATE: HatchPanelState = {
  started: false,
  jobs: {},
  totalCostUsd: 0,
  estimatedCostUsd: 0
};

/** 进度页内容区完整快照：调研卡片 + 合成摘要 + 质量报告 + hatch 面板。 */
export interface ProgressContentState {
  agents: AgentCardState[];
  warnings: string[];
  synthSummary: SynthesisSummaryPayload | null;
  qualityReport: QualityReport | null;
  appearanceReady: boolean;
  hatchState: HatchPanelState;
  doneCharacterId: string | null;
}

/** 新开蒸馏任务时的空内容区。 */
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

/**
 * 把一条 hatch 进度事件折进面板状态。
 *
 * 中途才挂上监听时可能错过 `start`，因此除 `default` 外任意事件都会把 `started` 置 true，
 * 避免面板一直空白。无副作用。
 *
 * @param state 当前 hatch 面板
 * @param evt 主进程 `HatchProgressEventDTO`
 * @returns 新面板快照；未知 `kind` 原样返回
 */
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
            // 镜像事件未带 rowState，从 `row-<state>` 的 jobId 反推姿态行。
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
 *
 * @param state 当前内容区
 * @returns 新快照；只把 pending/running 标成 cancelled，已结束的 job/agent 不动
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
 *
 * @param state 当前内容区
 * @param evt 主进程广播的蒸馏进度事件
 * @returns 新快照；未知 `kind` 原样返回。无副作用。
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
