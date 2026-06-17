import { Spinner } from "../../shared/feedback.js";
import { useI18n, useT } from "../../shared/i18n/index.js";
import { translatePhaseMessage } from "../progress/distillation-phase-i18n.js";
import { useDistillationJobs } from "./distillation-job-context.js";

export function DistillationJobBanner({
  onViewProgress,
  onGoLibrary
}: {
  onViewProgress: () => void;
  onGoLibrary: () => void;
}): JSX.Element | null {
  const t = useT();
  const { locale } = useI18n();
  const {
    activeJob,
    bannerStatus,
    progress,
    phaseLabel,
    failureReason,
    dismissBanner,
    cancelJob
  } = useDistillationJobs();

  if (!activeJob || !bannerStatus) return null;

  const { characterName } = activeJob;
  const displayPhase = translatePhaseMessage(phaseLabel, t, locale);
  const isRunning = bannerStatus === "running" || bannerStatus === "awaiting_research";

  let borderColor: string | undefined;
  if (bannerStatus === "failed") borderColor = "rgba(220, 38, 38, 0.35)";
  else if (bannerStatus === "done") borderColor = "rgba(22, 163, 74, 0.35)";
  else if (bannerStatus === "awaiting_research") borderColor = "rgba(217, 154, 58, 0.45)";

  let mainText: string;
  if (bannerStatus === "awaiting_research") {
    mainText = t("distill.bannerAwaitingResearch", { name: characterName });
  } else if (bannerStatus === "done") {
    mainText = t("distill.bannerDone", { name: characterName });
  } else if (bannerStatus === "failed") {
    mainText = t("distill.bannerFailed", { name: characterName });
  } else if (bannerStatus === "cancelled") {
    mainText = t("distill.bannerCancelled", { name: characterName });
  } else {
    mainText = t("distill.bannerRunning", {
      name: characterName,
      progress,
      phase: displayPhase
    });
  }

  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 16
      }}
    >
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderColor
        }}
      >
        {isRunning ? <Spinner /> : null}
        <span className="body-sm" style={{ flex: 1, lineHeight: 1.45 }}>
          {mainText}
          {bannerStatus === "failed" && failureReason ? (
            <span style={{ display: "block", color: "var(--ink-faint)", marginTop: 4 }}>
              {failureReason.length > 120 ? `${failureReason.slice(0, 120)}…` : failureReason}
            </span>
          ) : null}
        </span>
        <div className="row gap-2">
          {isRunning ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={onViewProgress}>
                {t("distill.bannerViewProgress")}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => void cancelJob()}>
                {t("distill.cancelDistillation")}
              </button>
            </>
          ) : bannerStatus === "done" ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={onGoLibrary}>
                {t("distill.goToLibrary")}
              </button>
              <button type="button" className="btn btn--ghost" onClick={dismissBanner}>
                {t("distill.bannerDismiss")}
              </button>
            </>
          ) : (
            <>
              {bannerStatus === "failed" ? (
                <button type="button" className="btn btn--ghost" onClick={onViewProgress}>
                  {t("distill.bannerViewProgress")}
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={dismissBanner}>
                {t("distill.bannerDismiss")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
