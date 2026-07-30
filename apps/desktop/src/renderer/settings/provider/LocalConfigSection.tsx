import { useState } from "react";
import { FieldLabel } from "../../shared/FieldHelp.js";
import { ReadinessChecklist } from "./ReadinessChecklist.js";
import type { ReadinessMap } from "./apply-recommended-bundle.js";
import {
  LOCAL_ENDPOINT_PRESETS,
  type LocalEndpointPreset
} from "./presets.js";
import { useT } from "../../shared/i18n/index.js";

const LOCAL_STEP_KEYS = ["step1", "step2", "step3"] as const;

export interface LocalConfigSectionProps {
  busy: boolean;
  presetId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  showKey: boolean;
  verifyProgress: string | null;
  readiness: ReadinessMap;
  onPresetChange(preset: LocalEndpointPreset): void;
  onBaseUrlChange(v: string): void;
  onModelChange(v: string): void;
  onApiKeyChange(v: string): void;
  onToggleShowKey(): void;
  onVerify(): void;
  onClear(): void;
  compact?: boolean;
}

function hostFromBaseUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return u.host || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

export function LocalConfigSection(props: LocalConfigSectionProps): JSX.Element {
  const t = useT();
  const [optionalKeyOpen, setOptionalKeyOpen] = useState(false);
  const canVerify = Boolean(props.baseUrl.trim() && props.model.trim());
  const hasReadinessResults = Object.values(props.readiness).some((s) => s.status !== "idle");
  const compact = props.compact === true;
  const presetLabel = t(
    `provider.local.presets.${props.presetId}.label` as "provider.local.presets.ollama.label"
  );
  const presetTagline = t(
    `provider.local.presets.${props.presetId}.tagline` as "provider.local.presets.ollama.tagline"
  );
  const hostChip = hostFromBaseUrl(props.baseUrl);

  return (
    <section className="forge-section provider-connect-section">
      <div className="forge-section__head">
        <span className="bl-field-label">{t("provider.local.title")}</span>
        <span className="forge-section__lede">{t("provider.local.lede")}</span>
      </div>

      <div
        className={
          compact
            ? "provider-connect__surface provider-connect__surface--compact"
            : "provider-connect__surface"
        }
      >
        <div className="provider-connect provider-connect--compact provider-local">
          <div className="provider-connect__steps provider-local__aside">
            <div className="provider-connect__steps-label">{t("provider.local.stepsTitle")}</div>
            <ol className="provider-step-rail provider-local__steps" aria-label={t("provider.local.stepsTitle")}>
              {LOCAL_STEP_KEYS.map((key, index) => (
                <li className="provider-step-rail__item" key={key}>
                  <span className="provider-step-rail__node" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="provider-step-rail__text">
                    {t(`provider.local.${key}` as "provider.local.step1")}
                  </span>
                </li>
              ))}
            </ol>
            <p className="provider-local__cap">{t("provider.local.capabilityNote")}</p>
          </div>

          <div className="provider-connect__action provider-local__action">
            <div className="provider-connect__brand provider-local__brand">
              <span className="display display--section provider-connect__brand-name">
                {presetLabel}
              </span>
              <span className="provider-connect__tagline">{presetTagline}</span>
              <span className="provider-local__host" title={props.baseUrl.trim() || undefined}>
                <span className="provider-local__host-dot" aria-hidden />
                {hostChip}
              </span>
            </div>

            <div className="provider-local__preset">
              <FieldLabel help={t("provider.help.localPreset")}>{t("provider.local.presetLabel")}</FieldLabel>
              <div
                className="segmented provider-local__preset-switch"
                role="group"
                aria-label={t("provider.local.presetLabel")}
              >
                {LOCAL_ENDPOINT_PRESETS.map((preset) => {
                  const active = props.presetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={active ? "segmented__item is-active" : "segmented__item"}
                      onClick={() => props.onPresetChange(preset)}
                      disabled={props.busy}
                    >
                      {t(
                        `provider.local.presets.${preset.id}.label` as "provider.local.presets.ollama.label"
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bl-provider-form-grid provider-local__fields">
              <div className="bl-provider-form-field bl-provider-form-field--wide">
                <FieldLabel htmlFor="local-provider-base" help={t("provider.help.baseUrl")}>
                  {t("provider.baseUrlLabel")}
                </FieldLabel>
                <input
                  id="local-provider-base"
                  className="input input--mono"
                  value={props.baseUrl}
                  onChange={(e) => props.onBaseUrlChange(e.target.value)}
                  placeholder="http://127.0.0.1:11434/v1"
                  disabled={props.busy}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="bl-provider-form-field bl-provider-form-field--wide">
                <FieldLabel htmlFor="local-provider-model" help={t("provider.help.mainModel")}>
                  {t("provider.mainModelLabel")}
                </FieldLabel>
                <input
                  id="local-provider-model"
                  className="input"
                  value={props.model}
                  onChange={(e) => props.onModelChange(e.target.value)}
                  placeholder={t("provider.local.modelPlaceholder")}
                  disabled={props.busy}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <details
              className="provider-local__optional"
              open={optionalKeyOpen}
              onToggle={(e) => setOptionalKeyOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary>{t("provider.local.optionalKeyTitle")}</summary>
              <div className="provider-connect__key-block">
                <FieldLabel htmlFor="local-provider-key" help={t("provider.help.localApiKey")}>
                  {t("provider.apiKeyLabel")}
                </FieldLabel>
                <div className="input-group provider-connect__key-input">
                  <input
                    id="local-provider-key"
                    className="input input--provider-key"
                    type={props.showKey ? "text" : "password"}
                    value={props.apiKey}
                    onChange={(e) => props.onApiKeyChange(e.target.value)}
                    placeholder={t("provider.local.apiKeyPlaceholder")}
                    disabled={props.busy}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="input-group__suffix">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={props.onToggleShowKey}
                      aria-label={
                        props.showKey ? t("provider.hideKeyAria") : t("provider.showKeyAria")
                      }
                    >
                      {props.showKey ? t("provider.hideKey") : t("provider.showKey")}
                    </button>
                  </div>
                </div>
                <p className="bl-field-hint provider-connect__key-hint">
                  {t("provider.local.apiKeyHint")}
                </p>
              </div>
            </details>

            <div className="provider-connect__cta-row">
              {!compact ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={props.onClear}
                  disabled={props.busy}
                >
                  {t("provider.clearConfig")}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="btn btn--magenta provider-connect__cta"
                onClick={props.onVerify}
                disabled={props.busy || !canVerify}
                data-hint={!canVerify ? t("provider.local.fillRequired") : ""}
              >
                {props.busy ? t("provider.verifyRunning") : t("provider.local.saveAndVerify")}
              </button>
            </div>

            {props.verifyProgress ? (
              <p className="bl-one-click-progress">{props.verifyProgress}</p>
            ) : null}

            {!compact && hasReadinessResults ? (
              <ReadinessChecklist
                readiness={props.readiness}
                titleKey="provider.readinessTitle"
                helpKey="provider.help.readinessLocal"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
