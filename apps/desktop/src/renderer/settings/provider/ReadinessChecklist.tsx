import { CopyButton, Spinner } from "../../shared/feedback.js";
import type { ReadinessKey, ReadinessMap, ReadinessState } from "./apply-recommended-bundle.js";
import { useT } from "../../shared/i18n/index.js";
import { FieldLabel } from "../../shared/FieldHelp.js";

const ALL_ROWS: ReadinessKey[] = ["chat", "vision", "webSearch", "imageGen"];

const LABEL_KEYS: Record<ReadinessKey, string> = {
  chat: "provider.readinessMeterChat",
  vision: "provider.readinessMeterVision",
  webSearch: "provider.readinessMeterWeb",
  imageGen: "provider.readinessMeterImage"
};

interface ReadinessChecklistProps {
  readiness: ReadinessMap;
  rows?: ReadinessKey[];
  titleKey?: "provider.readinessTitle" | "provider.readinessTitleQuick";
  helpKey?: "provider.help.readiness" | "provider.help.readinessQuick";
}

export function ReadinessChecklist({
  readiness,
  rows = ALL_ROWS,
  titleKey = "provider.readinessTitle",
  helpKey = "provider.help.readiness"
}: ReadinessChecklistProps): JSX.Element {
  const t = useT();
  const gridClass =
    rows.length === 1
      ? "provider-readiness-meter__grid provider-readiness-meter__grid--single"
      : "provider-readiness-meter__grid";

  return (
    <div className="provider-readiness-meter" role="group" aria-label={t(titleKey)}>
      <div className="provider-readiness-meter__head">
        <FieldLabel help={t(helpKey)}>{t(titleKey)}</FieldLabel>
      </div>
      <div className={gridClass}>
        {rows.map((key) => (
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
    const base =
      state.latencyMs != null
        ? `${t("provider.readinessOk")} · ${state.latencyMs} ms`
        : t("provider.readinessOk");
    statusText = state.detail ? `${base} · ${state.detail}` : base;
  } else if (state.status === "fail") {
    statusClass = "is-fail";
    statusText = state.reason || t("provider.readinessFail");
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
      {state.status === "fail" && state.hintKey ? (
        <span className="provider-readiness-meter__hint">{t(state.hintKey)}</span>
      ) : null}
      {state.status === "fail" && state.reason ? (
        // 很多用户不知道日志文件在哪、也看不懂英文报错，给一个一键复制按钮，
        // 让他们能把完整错误原文直接粘贴到聊天里发给我们，而不用去找 main.log。
        <CopyButton
          text={state.reason}
          label={t("provider.copyErrorDetail")}
          small
          className="provider-readiness-meter__copy"
        />
      ) : null}
    </div>
  );
}
