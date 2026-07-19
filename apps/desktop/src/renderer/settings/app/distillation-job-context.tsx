import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { HatchPetRowState, ResearchAgentId } from "@bailin/character-protocol";
import type {
  DistillationProgressEvent,
  ResearchSummaryPayload
} from "../../../shared/ipc-contract.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";
import { ResearchCheckpointDialog } from "../progress/ResearchCheckpointDialog.js";
import { SpriteCheckpointDialog } from "../progress/SpriteCheckpointDialog.js";
import {
  INITIAL_STAGE_DISPLAY,
  reduceStageDisplay,
  STAGE_COUNT,
  type StageDisplayState
} from "../progress/stage-model.js";
import {
  INITIAL_PROGRESS_CONTENT,
  freezeProgressContentOnCancel,
  reduceProgressContent,
  type ProgressContentState
} from "../progress/progress-content-model.js";
import {
  submitSpriteCheckpointAction,
  type SpriteCheckpointAction
} from "./sprite-checkpoint-action.js";

export type DistillationBannerStatus =
  | "running"
  | "awaiting_research"
  | "awaiting_sprite"
  | "done"
  | "failed"
  | "cancelled";

export interface ActiveDistillationJob {
  jobId: string;
  characterName: string;
  track: "utility" | "companion";
}

interface DistillationJobContextValue {
  activeJob: ActiveDistillationJob | null;
  bannerStatus: DistillationBannerStatus | null;
  /** 当前阶段下标 + 1（1..STAGE_COUNT），只前进不后退——banner 用它拼「步骤 X/6」，
   * 不再直接透传后端的原始百分比（质量自检触发重提炼时那个数字会往回跳，
   * 详见 stage-model.ts 顶部注释）。 */
  currentStep: number;
  totalSteps: number;
  phaseLabel: string;
  /** 权威的阶段展示状态——DistillationProgress 页面直接消费它做阶段条，而不是
   * 自己再维护一份 reducer，这样切换设置 tab 导致页面被卸载重建时，重新挂载
   * 也不会把已经走到的阶段"退回第一步"（context 本身不随 tab 切换卸载）。 */
  stageDisplay: StageDisplayState;
  /**
   * 进度页内容区（Agent 列表 / 外貌就绪 / hatch 面板等）。与 stageDisplay 同理：
   * 必须挂在不随 tab 卸载的 Provider 上，否则切走再回来会丢步骤 4/5。
   */
  progressContent: ProgressContentState;
  failureReason?: string;
  isSkeleton?: boolean;
  researchSummary: ResearchSummaryPayload | null;
  startJob: (job: ActiveDistillationJob) => void;
  clearJob: () => void;
  dismissBanner: () => void;
  cancelJob: () => Promise<void>;
}

const DistillationJobContext = createContext<DistillationJobContextValue | null>(null);

const TERMINAL: DistillationBannerStatus[] = ["done", "failed", "cancelled"];

export function DistillationJobProvider({ children }: { children: ReactNode }): JSX.Element {
  const t = useT();
  const bailin = useBailin();
  const { showToast } = useToast();
  const [activeJob, setActiveJob] = useState<ActiveDistillationJob | null>(null);
  const [bannerStatus, setBannerStatus] = useState<DistillationBannerStatus | null>(null);
  const [stageDisplay, setStageDisplay] = useState(INITIAL_STAGE_DISPLAY);
  const [progressContent, setProgressContent] = useState(INITIAL_PROGRESS_CONTENT);
  const [phaseLabel, setPhaseLabel] = useState("启动中…");
  const [failureReason, setFailureReason] = useState<string | undefined>();
  const [isSkeleton, setIsSkeleton] = useState(false);
  const [researchSummary, setResearchSummary] = useState<ResearchSummaryPayload | null>(null);
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const [showSpriteCheckpoint, setShowSpriteCheckpoint] = useState(false);
  const [spriteFailedRows, setSpriteFailedRows] = useState<HatchPetRowState[]>([]);
  const [spriteRowFailures, setSpriteRowFailures] = useState<
    Partial<Record<HatchPetRowState, string>>
  >({});
  const [spriteTotalCostUsd, setSpriteTotalCostUsd] = useState(0);
  const [spriteActionPending, setSpriteActionPending] =
    useState<SpriteCheckpointAction | null>(null);
  const activeJobRef = useRef<ActiveDistillationJob | null>(null);
  const bannerStatusRef = useRef<DistillationBannerStatus | null>(null);
  /** 用户已点取消：立刻切终态，并忽略后续 phase/done，避免后台晚到事件把 UI 拉回去。 */
  const userCancelledRef = useRef(false);

  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  useEffect(() => {
    bannerStatusRef.current = bannerStatus;
  }, [bannerStatus]);

  const resetJobState = useCallback(() => {
    userCancelledRef.current = false;
    setActiveJob(null);
    setBannerStatus(null);
    setStageDisplay(INITIAL_STAGE_DISPLAY);
    setProgressContent(INITIAL_PROGRESS_CONTENT);
    setPhaseLabel("启动中…");
    setFailureReason(undefined);
    setIsSkeleton(false);
    setResearchSummary(null);
    setShowCheckpoint(false);
    setShowSpriteCheckpoint(false);
    setSpriteFailedRows([]);
    setSpriteRowFailures({});
    setSpriteTotalCostUsd(0);
    setSpriteActionPending(null);
  }, []);

  const startJob = useCallback((job: ActiveDistillationJob) => {
    userCancelledRef.current = false;
    setActiveJob(job);
    setBannerStatus("running");
    setStageDisplay(INITIAL_STAGE_DISPLAY);
    setProgressContent(INITIAL_PROGRESS_CONTENT);
    setPhaseLabel("启动中…");
    setFailureReason(undefined);
    setIsSkeleton(false);
    setResearchSummary(null);
    setShowCheckpoint(false);
    setShowSpriteCheckpoint(false);
    setSpriteFailedRows([]);
    setSpriteRowFailures({});
    setSpriteTotalCostUsd(0);
    setSpriteActionPending(null);
  }, []);

  const clearJob = useCallback(() => {
    resetJobState();
  }, [resetJobState]);

  const dismissBanner = useCallback(() => {
    if (bannerStatus && TERMINAL.includes(bannerStatus)) {
      resetJobState();
    }
  }, [bannerStatus, resetJobState]);

  const cancelJob = useCallback(async () => {
    const job = activeJobRef.current;
    if (!job) return;
    const status = bannerStatusRef.current;
    if (status === "running" || status === "awaiting_research" || status === "awaiting_sprite") {
      // 乐观 UI：不等主进程 yield cancelled，立即给用户反馈
      userCancelledRef.current = true;
      setBannerStatus("cancelled");
      setPhaseLabel("已取消");
      setProgressContent((prev) => freezeProgressContentOnCancel(prev));
      setShowCheckpoint(false);
      setShowSpriteCheckpoint(false);
      showToast({
        kind: "warn",
        text: t("distill.toastCancelled", { name: job.characterName })
      });
      try {
        await bailin.characters.cancelDistillation(job.jobId);
      } catch {
        // IPC 失败时 UI 已是取消态；主进程若仍在跑，用户至少能离开进度页
      }
      return;
    }
    resetJobState();
  }, [bailin, resetJobState, showToast, t]);

  const approveResearch = useCallback(
    async (supplementalAgentIds?: ResearchAgentId[]) => {
      const job = activeJobRef.current;
      if (!job || userCancelledRef.current) return;
      setShowCheckpoint(false);
      setBannerStatus("running");
      await bailin.characters.approveDistillation({
        jobId: job.jobId,
        phase: "research",
        supplementalAgentIds
      });
    },
    [bailin]
  );

  const resolveSprite = useCallback(
    async (action: "retry" | "continue") => {
      const job = activeJobRef.current;
      if (!job || userCancelledRef.current || spriteActionPending) return;
      setSpriteActionPending(action);
      const result = await submitSpriteCheckpointAction(
        action,
        spriteFailedRows,
        job.jobId,
        (request) => bailin.characters.approveDistillation(request)
      );
      if (result.ok) {
        setShowSpriteCheckpoint(false);
        setBannerStatus("running");
        setPhaseLabel(
          action === "retry"
            ? t("distill.spriteCheckpointRetrying")
            : t("distill.spriteCheckpointContinuing")
        );
      } else {
        showToast({
          kind: "error",
          text: result.error ?? t("distill.spriteCheckpointActionFailed")
        });
      }
      setSpriteActionPending(null);
    },
    [bailin, showToast, spriteActionPending, spriteFailedRows, t]
  );

  useEffect(() => {
    const off = bailin.on.distillationProgress((evt: DistillationProgressEvent) => {
      const job = activeJobRef.current;
      if (!job || evt.jobId !== job.jobId) return;

      // 用户已取消：仍累加内容（无害），但绝不把 banner 拉回 running/done
      if (userCancelledRef.current) {
        if (evt.kind === "cancelled") {
          setShowCheckpoint(false);
          setShowSpriteCheckpoint(false);
        }
        return;
      }

      setProgressContent((prev) => reduceProgressContent(prev, evt));

      switch (evt.kind) {
        case "started":
          setBannerStatus("running");
          setPhaseLabel("已启动");
          break;
        case "phase":
          setPhaseLabel(evt.message);
          setStageDisplay((prev) => reduceStageDisplay(prev, { phase: evt.phase, message: evt.message }));
          if (evt.phase === "awaiting_research_ok") {
            setBannerStatus("awaiting_research");
            setShowCheckpoint(true);
          } else if (evt.phase === "awaiting_sprite_ok") {
            setBannerStatus("awaiting_sprite");
            setShowSpriteCheckpoint(true);
          } else if (
            bannerStatusRef.current === "awaiting_research" ||
            bannerStatusRef.current === "awaiting_sprite"
          ) {
            setBannerStatus("running");
            setShowCheckpoint(false);
            setShowSpriteCheckpoint(false);
          }
          break;
        case "sprite_incomplete":
          setSpriteFailedRows(evt.failedRows);
          setSpriteRowFailures(evt.rowFailures ?? {});
          setSpriteTotalCostUsd(evt.totalCostUsd);
          break;
        case "research_complete":
          setResearchSummary(evt.summary);
          break;
        case "done":
          setPhaseLabel("完成");
          setBannerStatus("done");
          setIsSkeleton(evt.isSkeleton);
          setShowCheckpoint(false);
          setShowSpriteCheckpoint(false);
          showToast({
            kind: "success",
            text: evt.isSkeleton
              ? t("distill.toastDoneSkeleton", { name: job.characterName })
              : t("distill.toastDone", { name: job.characterName })
          });
          break;
        case "failed":
          setBannerStatus("failed");
          setFailureReason(evt.reason);
          setShowCheckpoint(false);
          setShowSpriteCheckpoint(false);
          showToast({
            kind: "error",
            text: t("distill.toastFailed", { name: job.characterName })
          });
          break;
        case "cancelled":
          setBannerStatus("cancelled");
          setShowCheckpoint(false);
          setShowSpriteCheckpoint(false);
          showToast({
            kind: "warn",
            text: t("distill.toastCancelled", { name: job.characterName })
          });
          break;
      }
    });
    return off;
  }, [bailin, showToast, t]);

  const currentStep = Math.min(stageDisplay.activeIndex + 1, STAGE_COUNT);

  const value = useMemo(
    () => ({
      activeJob,
      bannerStatus,
      currentStep,
      totalSteps: STAGE_COUNT,
      stageDisplay,
      progressContent,
      phaseLabel,
      failureReason,
      isSkeleton,
      researchSummary,
      startJob,
      clearJob,
      dismissBanner,
      cancelJob
    }),
    [
      activeJob,
      bannerStatus,
      currentStep,
      stageDisplay,
      progressContent,
      phaseLabel,
      failureReason,
      isSkeleton,
      researchSummary,
      startJob,
      clearJob,
      dismissBanner,
      cancelJob
    ]
  );

  return (
    <DistillationJobContext.Provider value={value}>
      {children}
      {showCheckpoint ? (
        <ResearchCheckpointDialog
          researchSummary={researchSummary}
          onApprove={() => void approveResearch()}
          onSupplement={(agentIds) => void approveResearch(agentIds)}
          onCancel={() => void cancelJob()}
        />
      ) : null}
      {showSpriteCheckpoint ? (
        <SpriteCheckpointDialog
          failedRows={spriteFailedRows}
          rowFailures={spriteRowFailures}
          totalCostUsd={spriteTotalCostUsd}
          pendingAction={spriteActionPending}
          onRetry={() => void resolveSprite("retry")}
          onContinue={() => void resolveSprite("continue")}
          onCancel={() => void cancelJob()}
        />
      ) : null}
    </DistillationJobContext.Provider>
  );
}

export function useDistillationJobs(): DistillationJobContextValue {
  const ctx = useContext(DistillationJobContext);
  if (!ctx) {
    throw new Error("useDistillationJobs must be used within DistillationJobProvider");
  }
  return ctx;
}
