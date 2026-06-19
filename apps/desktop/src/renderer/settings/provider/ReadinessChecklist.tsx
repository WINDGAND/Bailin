import { Spinner } from "../../shared/feedback.js";
import type { ReadinessKey, ReadinessMap, ReadinessState } from "./apply-recommended-bundle.js";
import { useT } from "../../shared/i18n/index.js";
import { FieldLabel } from "../../shared/FieldHelp.js";

const ROWS: ReadinessKey[] = ["chat", "vision", "webSearch", "imageGen"];

const LABEL_KEYS: Record<ReadinessKey, string> = {
  chat: "provider.readinessMeterChat",
  vision: "provider.readinessMeterVision",
  webSearch: "provider.readinessMeterWeb",
  imageGen: "provider.readinessMeterImage"
};

interface ReadinessChecklistProps {
  readiness: ReadinessMap;
}

export function ReadinessChecklist({ readiness }: ReadinessChecklistProps): JSX.Element {
  const t = useT();

  return (
    <div className="provider-readiness-meter" role="group" aria-label={t("provider.readinessTitle")}>
      <div className="provider-readiness-meter__head">
        <FieldLabel help={t("provider.help.readiness")}>{t("provider.readinessTitle")}</FieldLabel>
      </div>
      <div className="provider-readiness-meter__grid">
        {ROWS.map((key) => (
          <ReadinessCell key={key} label={t(LABEL_KEYS[key])} state={readiness[key]} />
        ))}
      </div>
    </div>
  );
}

function ReadinessCell({ label, state }: { label: string; state: ReadinessState }): JSX.Element {
  const t = useT();
  let statusClass = "is-idle";
  let statusText = t("provider.readinessIdle");

  if (state.status === "running") {
    statusClass = "is-running";
    statusText = t("provider.readinessRunning");
  } else if (state.status === "ok") {
    statusClass = "is-ok";
    statusText =
      state.latencyMs != null
        ? `${t("provider.readinessOk")} · ${state.latencyMs} ms`
        : t("provider.readinessOk");
  } else if (state.status === "fail") {
    statusClass = "is-fail";
    statusText = t("provider.readinessFail");
  } else if (state.status === "unavailable") {
    statusClass = "is-unavailable";
    statusText = t("provider.readinessUnavailable");
  }

  return (
    <div className={`provider-readiness-meter__cell ${statusClass}`}>
      <div className="provider-readiness-meter__bar" aria-hidden />
      <span className="provider-readiness-meter__label">{label}</span>
      <span className="provider-readiness-meter__status">
        {state.status === "running" ? <Spinner magenta /> : null}
        <span>{statusText}</span>
      </span>
    </div>
  );
}
