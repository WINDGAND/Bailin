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
}

/**
 * 深度创建页顶部的阶段步骤条。
 *
 * 设计要点（对应用户反馈的三个问题）：
 *   1. 「不知道进行到第几步」——6 个带编号的节点 + 右上角「步骤 X/6」文字，
 *      任何时刻都能一眼看出总共几步、现在第几步。
 *   2. 「进度条会跳来跳去看着像 bug」——activeIndex 由 stage-model.ts 保证
 *      只前进不后退；质量自检触发的重提炼不会把步骤条推回「提炼」，而是在
 *      「质量自检」节点上挂一个「优化中 · 第 N 轮」角标，用户能看懂"这是在
 *      打磨，不是失败重来"。
 *   3. 不显示具体百分比数字——LLM 多智能体流程的真实耗时本来就没法准确
 *      预估，一个精确到个位数的百分比反而容易让人误判剩余时间、放大"进度
 *      抖动"的观感；步骤条 + 当前阶段文字说明已经足够表达"在哪、还有多远"。
 */
export function DistillationStageRail({
  activeIndex,
  isResynthesizing,
  resynthesisRound,
  forceAllDone = false
}: Props): JSX.Element {
  const t = useT();
  const effectiveActive = forceAllDone ? STAGE_COUNT : activeIndex;
  const currentStepNumber = Math.min(effectiveActive + 1, STAGE_COUNT);

  return (
    <div className="distill-stage-rail__wrap">
      <span className="distill-stage-rail__step-count">
        {t("distill.stageStepOf", { current: currentStepNumber, total: STAGE_COUNT })}
      </span>
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
                <div className={`distill-stage-rail__connector ${i < effectiveActive ? "is-done" : ""}`} />
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
    </div>
  );
}
