import { Spinner } from "../../shared/feedback.js";
import { useT } from "../../shared/i18n/index.js";

/**
 * 供应商设置页的三类状态条：语言模型连接、联网搜索探测、视觉模型探测。
 * 视觉上共用 `.bl-status-strip`，但终态语义不同——尤其是联网探测：
 * HTTP 成功不等于真搜索，部分供应商会 200 却不走 search 工具。
 */

/** 语言模型连接测试四态。`ok` 可带延迟毫秒；`error` 带可读原因。 */
export type ConnStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; latency?: number }
  | { kind: "error"; message: string };

/**
 * 联网搜索探测结果。
 * `null` 尚未探测；`running` 探测中；`done` 结束后：
 * `ok` 只表示请求完成，`realWebSearch` 才表示真正打到搜索工具。
 */
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

/** 视觉模型探测：`null` 未测；完成后 `ok` 表示模型接受了图片输入。 */
export type VisionProbe =
  | null
  | { state: "running" }
  | { state: "done"; ok: boolean; latencyMs?: number; reason?: string };

/**
 * 语言模型 API 连接状态条。
 *
 * @param status 当前探测态（idle / running / ok / error）
 * @param apiKey 明文密钥，仅用于判断是否已配置，不在条上展示
 * @param keyMasked 脱敏后的展示串（已配置时写入详情）
 */
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
  // idle：有密钥只表示「已填写」，尚未探测，所以不用 is-ok。
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

/**
 * 联网搜索能力条：未探测时展示 caps 静态声明，点「探测」后覆盖为 probe 结果。
 *
 * @param caps 主进程能力探测（是否声明支持 webSearch）
 * @param probe 主动探测进度；`done` 时优先于 caps
 * @param disabled 无密钥等条件下禁止探测
 * @param onProbe 触发一次真实联网探测（副作用：打供应商 API）
 */
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
    // HTTP 通了但没走搜索工具 → warn（部分成功），只有 realWebSearch 才算绿灯。
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

/**
 * 视觉能力条：未探测时按 caps 声明，探测完成后按 `visionProbe.ok` 上色。
 *
 * @param vision 主进程视觉能力声明；`null` 表示尚未检测
 * @param visionProbe 主动喂图探测进度
 * @param visionModel 用于详情展示；取 path 最后一段做短名
 * @param onProbe 触发一次视觉探测（副作用：向视觉模型发测试图）
 */
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
