import { Spinner } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";

export type ConnStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; latency?: number }
  | { kind: "error"; message: string };

export type WebProbe =
  | null
  | { state: "running" }
  | {
      state: "done";
      ok: boolean;
      realWebSearch: boolean;
      citations: number;
      latencyMs?: number;
      reason?: string;
    };

export type VisionProbe =
  | null
  | { state: "running" }
  | { state: "done"; ok: boolean; latencyMs?: number; reason?: string };

export function ConnStrip({
  status,
  apiKey,
  keyMasked
}: {
  status: ConnStatus;
  apiKey: string;
  keyMasked: string;
}): JSX.Element {
  const t = useT();
  if (status.kind === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.connTesting")}</div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (status.kind === "ok") {
    return (
      <div className="bl-status-strip is-ok">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.connOk")}</div>
          <div className="bl-status-strip__detail"><strong>{status.latency ?? "?"} ms</strong></div>
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="bl-status-strip is-error">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.connFailed")}</div>
          <div className="bl-status-strip__detail">{status.message}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={apiKey ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">
          {apiKey ? t("provider.connConfigured") : t("provider.connNotConfigured")}
        </div>
        <div className="bl-status-strip__detail">
          {apiKey
            ? t("provider.connConfiguredDetail", { masked: keyMasked })
            : t("provider.connNotConfiguredDetail")}
        </div>
      </div>
    </div>
  );
}

export function NetStrip({
  caps,
  probe,
  disabled,
  disabledHint,
  onProbe,
  helpText
}: {
  caps: { webSearch: boolean; reason: string } | null;
  probe: WebProbe;
  disabled: boolean;
  disabledHint: string;
  onProbe: () => void;
  helpText?: string;
}): JSX.Element {
  const t = useT();
  if (probe?.state === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.netTestingTitle")}</div>
          <div className="bl-status-strip__detail">{t("provider.netTestingDetail")}</div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (probe?.state === "done") {
    const ok = probe.ok && probe.realWebSearch;
    return (
      <div className={ok ? "bl-status-strip is-ok" : probe.ok ? "bl-status-strip is-warn" : "bl-status-strip is-error"}>
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">
            {ok
              ? t("provider.netOkTitle")
              : probe.ok
                ? t("provider.netPartialTitle")
                : t("provider.netFailedTitle")}
          </div>
          <div className="bl-status-strip__detail">
            {ok
              ? t("provider.netOkDetail", {
                  count: probe.citations,
                  latency: probe.latencyMs ?? "?"
                })
              : probe.ok
                ? t("provider.netPartialDetail")
                : probe.reason ?? t("common.unknownError")}
          </div>
        </div>
        <div className="bl-status-strip__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onProbe} disabled={disabled}>
            {t("provider.retest")}
          </button>
        </div>
      </div>
    );
  }
  const isOk = caps?.webSearch === true;
  return (
    <div className={isOk ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">
          {caps == null
            ? t("provider.netUnknownTitle")
            : isOk
              ? t("provider.netSupportedTitle")
              : t("provider.netUnsupportedTitle")}
        </div>
        <div className="bl-status-strip__detail">
          {caps == null
            ? t("provider.netUnknownDetail")
            : isOk
              ? helpText ?? t("provider.netSupportedDetail")
              : caps.reason}
        </div>
      </div>
      <div className="bl-status-strip__action">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onProbe}
          disabled={disabled}
          data-hint={disabled ? disabledHint : ""}
        >
          {t("provider.probeWeb")}
        </button>
      </div>
    </div>
  );
}

export function VisionStrip({
  vision,
  visionProbe,
  visionModel,
  disabled,
  onProbe
}: {
  vision: { vision: boolean; reason: string } | null;
  visionProbe: VisionProbe;
  visionModel: string;
  disabled: boolean;
  onProbe: () => void;
}): JSX.Element {
  const t = useT();
  const modelShort = visionModel.split("/").pop() ?? visionModel;
  if (visionProbe?.state === "running") {
    return (
      <div className="bl-status-strip is-running">
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">{t("provider.visionTestingTitle")}</div>
          <div className="bl-status-strip__detail">
            {t("provider.visionTestingDetail", { model: visionModel })}
          </div>
        </div>
        <div className="bl-status-strip__action"><Spinner magenta /></div>
      </div>
    );
  }
  if (visionProbe?.state === "done") {
    return (
      <div className={visionProbe.ok ? "bl-status-strip is-ok" : "bl-status-strip is-warn"}>
        <div className="bl-status-strip__body">
          <div className="bl-status-strip__title">
            {visionProbe.ok ? t("provider.visionOkTitle") : t("provider.visionRejectedTitle")}
          </div>
          <div className="bl-status-strip__detail">
            {visionProbe.ok
              ? t("provider.visionOkDetail", { latency: visionProbe.latencyMs ?? "?" })
              : visionProbe.reason ?? t("provider.visionRejectedDetail")}
          </div>
        </div>
        <div className="bl-status-strip__action">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onProbe} disabled={disabled}>
            {t("provider.retest")}
          </button>
        </div>
      </div>
    );
  }
  const isOk = vision?.vision === true;
  return (
    <div className={isOk ? "bl-status-strip" : "bl-status-strip is-warn"}>
      <div className="bl-status-strip__body">
        <div className="bl-status-strip__title">
          {vision == null
            ? t("provider.visionUnknownTitle")
            : isOk
              ? t("provider.visionSupportedTitle")
              : t("provider.visionUnsupportedTitle")}
        </div>
        <div className="bl-status-strip__detail">
          {vision == null
            ? t("provider.visionUnknownDetail")
            : isOk
              ? t("provider.visionSupportedDetail", { model: modelShort })
              : vision.reason}
        </div>
      </div>
      <div className="bl-status-strip__action">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onProbe}
          disabled={disabled}
          data-hint={disabled ? t("provider.fillKeyFirst") : ""}
        >
          {t("provider.probeVision")}
        </button>
      </div>
    </div>
  );
}
