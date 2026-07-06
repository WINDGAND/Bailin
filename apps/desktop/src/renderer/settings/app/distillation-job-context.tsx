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
import type { ResearchAgentId } from "@bailin/character-protocol";
import type {
  DistillationProgressEvent,
  ResearchSummaryPayload
} from "../../../shared/ipc-contract.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useToast } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";
import { ResearchCheckpointDialog } from "../progress/ResearchCheckpointDialog.js";
import {
  INITIAL_STAGE_DISPLAY,
  reduceStageDisplay,
  STAGE_COUNT,
  type StageDisplayState
} from "../progress/stage-model.js";

export type DistillationBannerStatus =
  | "running"
  | "awaiting_research"
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
  const [phaseLabel, setPhaseLabel] = useState("启动中…");
  const [failureReason, setFailureReason] = useState<string | undefined>();
  const [isSkeleton, setIsSkeleton] = useState(false);
  const [researchSummary, setResearchSummary] = useState<ResearchSummaryPayload | null>(null);
  const [showCheckpoint, setShowCheckpoint] = useState(false);
  const activeJobRef = useRef<ActiveDistillationJob | null>(null);
  const bannerStatusRef = useRef<DistillationBannerStatus | null>(null);

  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  useEffect(() => {
    bannerStatusRef.current = bannerStatus;
  }, [bannerStatus]);

  const resetJobState = useCallback(() => {
    setActiveJob(null);
    setBannerStatus(null);
    setStageDisplay(INITIAL_STAGE_DISPLAY);
    setPhaseLabel("启动中…");
    setFailureReason(undefined);
    setIsSkeleton(false);
    setResearchSummary(null);
    setShowCheckpoint(false);
  }, []);

  const startJob = useCallback((job: ActiveDistillationJob) => {
    setActiveJob(job);
    setBannerStatus("running");
    setStageDisplay(INITIAL_STAGE_DISPLAY);
    setPhaseLabel("启动中…");
    setFailureReason(undefined);
    setIsSkeleton(false);
    setResearchSummary(null);
    setShowCheckpoint(false);
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
    if (status === "running" || status === "awaiting_research") {
      await bailin.characters.cancelDistillation(job.jobId);
      return;
    }
    resetJobState();
  }, [bailin, resetJobState]);

  const approveResearch = useCallback(
    async (supplementalAgentIds?: ResearchAgentId[]) => {
      const job = activeJobRef.current;
      if (!job) return;
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

  useEffect(() => {
    const off = bailin.on.distillationProgress((evt: DistillationProgressEvent) => {
      const job = activeJobRef.current;
      if (!job || evt.jobId !== job.jobId) return;

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
          } else if (bannerStatusRef.current === "awaiting_research") {
            setBannerStatus("running");
            setShowCheckpoint(false);
          }
          break;
        case "research_complete":
          setResearchSummary(evt.summary);
          break;
        case "done":
          setPhaseLabel("完成");
          setBannerStatus("done");
          setIsSkeleton(evt.isSkeleton);
          setShowCheckpoint(false);
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
          showToast({
            kind: "error",
            text: t("distill.toastFailed", { name: job.characterName })
          });
          break;
        case "cancelled":
          setBannerStatus("cancelled");
          setShowCheckpoint(false);
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
