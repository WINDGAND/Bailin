import { Spinner } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";
import type { VisualJob } from "./visual-job-context.js";
import { useVisualJobs } from "./visual-job-context.js";

function bannerText(job: VisualJob, t: ReturnType<typeof useT>): string {
  if (job.status === "running") {
    return job.kind === "sprite"
      ? t("library.visualJobRunningSprite", { name: job.characterName })
      : t("library.visualJobRunningAppearance", { name: job.characterName });
  }
  if (job.status === "success") {
    return job.kind === "sprite"
      ? t("library.visualJobDoneSprite", { name: job.characterName })
      : t("library.visualJobDoneAppearance", { name: job.characterName });
  }
  return t("library.visualJobFailed", {
    name: job.characterName,
    error: job.error ?? t("common.unknownError")
  });
}

export function VisualJobBanner({
  onGoLibrary
}: {
  onGoLibrary: () => void;
}): JSX.Element | null {
  const t = useT();
  const { jobsByCharacterId, dismissJob } = useVisualJobs();
  const jobs = Object.values(jobsByCharacterId);
  if (jobs.length === 0) return null;

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
      {jobs.map((job) => (
        <div
          key={job.characterId}
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderColor:
              job.status === "error"
                ? "rgba(220, 38, 38, 0.35)"
                : job.status === "success"
                  ? "rgba(22, 163, 74, 0.35)"
                  : undefined
          }}
        >
          {job.status === "running" ? <Spinner /> : null}
          <span className="body-sm" style={{ flex: 1, lineHeight: 1.45 }}>
            {bannerText(job, t)}
          </span>
          <div className="row gap-2">
            <button type="button" className="btn btn--ghost" onClick={onGoLibrary}>
              {t("library.visualJobGoLibrary")}
            </button>
            {job.status !== "running" ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => dismissJob(job.characterId)}
              >
                {t("library.visualJobDismiss")}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
