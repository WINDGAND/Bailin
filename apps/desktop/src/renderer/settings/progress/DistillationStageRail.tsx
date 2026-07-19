import { useT } from "../../shared/i18n/index.js";
import { STAGE_KEYS, STAGE_COUNT, type StageKey } from "./stage-model.js";

const STAGE_LABEL_KEYS: Record<StageKey, string> = {
  researching: "distill.stageResearching",
  synthesizing: "distill.stageSynthesizing",
  building_card: "distill.stageBuildingCard",
  researching_appearance: "distill.stageResearchingAppearance",
  building_sprite: "distill.stageBuildingSprite",
  quality_check: "distill.stageQualityCheck"
};

type NodeStatus = "pending" | "active" | "done";

interface Props {
  /** 当前应高亮的阶段下标（0..STAGE_COUNT-1），只会前进不会后退——见 stage-model.ts。 */
  activeIndex: number;
  /** 是否处于质量自检触发的定向重提炼（不会让步骤条后退，只在最后一步挂一个角标）。 */
  isResynthesizing: boolean;
  resynthesisRound: number | null;
  /** 蒸馏已经整体完成时，强制把 6 步都显示成「已完成」。 */
  forceAllDone?: boolean;
  /**
   * 进行中时显示在步骤条下方的轻量提示（轮换文案）。
   * 与步骤轨合为一块，不再单独挂「正在工作」状态条。
   */
  activityHint?: string | null;
}

/**
 * 深度创建页顶部的阶段步骤条（含可选进行中提示）。
 *
 * 设计要点：
 *   1. 「不知道进行到第几步」——6 个带编号的节点 + 「步骤 X/6」。
 *   2. activeIndex 只前进不后退；重提炼在质量自检节点挂角标。
 *   3. 不显示百分比；进行中用底部一行 caption，避免再叠一张状态卡片。
 */
export function DistillationStageRail({
  activeIndex,
  isResynthesizing,
  resynthesisRound,
  forceAllDone = false,
  activityHint = null
}: Props): JSX.Element {
  const t = useT();
  const effectiveActive = forceAllDone ? STAGE_COUNT : activeIndex;
  const currentStepNumber = Math.min(effectiveActive + 1, STAGE_COUNT);

  return (
    <div className="distill-stage-rail__wrap">
      <div className="distill-stage-rail__panel">
        <div className="distill-stage-rail__meta">
          <span className="distill-stage-rail__step-count">
            {t("distill.stageStepOf", { current: currentStepNumber, total: STAGE_COUNT })}
          </span>
        </div>
        <div className="distill-stage-rail" role="list" aria-label={t("distill.progressAria")}>
          {STAGE_KEYS.map((key, i) => {
            const status: NodeStatus =
              i < effectiveActive ? "done" : i === effectiveActive ? "active" : "pending";
            const isLast = i === STAGE_KEYS.length - 1;
            const statusLabel =
              status === "done"
                ? t("distill.stageStatusDone")
                : status === "active"
                  ? t("distill.stageStatusActive")
                  : t("distill.stageStatusPending");
            return (
              <div
                className="distill-stage-rail__item"
                role="listitem"
                aria-label={`${t(STAGE_LABEL_KEYS[key])} — ${statusLabel}`}
                key={key}
              >
                {!isLast ? (
                  <div
                    className={`distill-stage-rail__connector ${i < effectiveActive ? "is-done" : ""}`}
                  />
                ) : null}
                <div className={`distill-stage-rail__node is-${status}`} aria-hidden>
                  {status === "done" ? "✓" : i + 1}
                </div>
                <div className={`distill-stage-rail__label is-${status}`}>
                  {t(STAGE_LABEL_KEYS[key])}
                  {status === "active" && isResynthesizing && key === "quality_check" ? (
                    <span className="distill-stage-rail__badge">
                      {t("distill.stageOptimizing", { round: resynthesisRound ?? 1 })}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {activityHint ? (
          <p className="distill-stage-rail__caption" aria-live="polite">
            <span className="distill-stage-rail__caption-dot" aria-hidden="true" />
            <span className="distill-stage-rail__caption-text">{activityHint}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
