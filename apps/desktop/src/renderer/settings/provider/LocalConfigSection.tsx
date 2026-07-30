import { useState } from "react";
import { FieldLabel } from "../../shared/FieldHelp.js";
import { ReadinessChecklist } from "./ReadinessChecklist.js";
import type { ReadinessMap } from "./apply-recommended-bundle.js";
import {
  LOCAL_ENDPOINT_PRESETS,
  type LocalEndpointPreset
} from "./presets.js";
import { useT } from "../../shared/i18n/index.js";

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
}

export function LocalConfigSection(props: LocalConfigSectionProps): JSX.Element {
  const t = useT();
  const [optionalKeyOpen, setOptionalKeyOpen] = useState(false);
  const canVerify = Boolean(props.baseUrl.trim() && props.model.trim());
  const hasReadinessResults = Object.values(props.readiness).some((s) => s.status !== "idle");

  return (
    <section className="forge-section provider-connect-section">
      <div className="forge-section__head">
        <span className="bl-field-label">{t("provider.local.title")}</span>
        <span className="forge-section__lede">{t("provider.local.lede")}</span>
      </div>

      <div className="provider-connect__surface">
        <div className="provider-custom-body">
          <p className="body-sm" style={{ margin: "0 0 14px", color: "var(--ink-muted)" }}>
            {t("provider.local.steps")}
          </p>

          <div className="bl-provider-form-field" style={{ marginBottom: 14 }}>
            <FieldLabel help={t("provider.help.localPreset")}>{t("provider.local.presetLabel")}</FieldLabel>
            <div className="segmented" role="group" aria-label={t("provider.local.presetLabel")}>
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
            <p className="bl-field-hint" style={{ marginTop: 8 }}>
              {t(
                `provider.local.presets.${props.presetId}.hint` as "provider.local.presets.ollama.hint"
              )}
            </p>
          </div>

          <div className="bl-provider-form-grid">
            <div className="bl-provider-form-field bl-provider-form-field--wide">
              <FieldLabel htmlFor="local-provider-base" help={t("provider.help.baseUrl")}>
                {t("provider.baseUrlLabel")}
              </FieldLabel>
              <input
                id="local-provider-base"
                className="input"
                value={props.baseUrl}
                onChange={(e) => props.onBaseUrlChange(e.target.value)}
                placeholder="http://127.0.0.1:11434/v1"
                disabled={props.busy}
                autoComplete="off"
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
              />
            </div>
          </div>

          <details
            className="provider-local-optional"
            open={optionalKeyOpen}
            onToggle={(e) => setOptionalKeyOpen((e.target as HTMLDetailsElement).open)}
            style={{ marginTop: 14 }}
          >
            <summary className="body-sm" style={{ cursor: "pointer", color: "var(--ink-muted)" }}>
              {t("provider.local.optionalKeyTitle")}
            </summary>
            <div className="provider-connect__key-block" style={{ marginTop: 10 }}>
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
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={props.onToggleShowKey}
                  aria-label={props.showKey ? t("provider.hideKeyAria") : t("provider.showKeyAria")}
                >
                  {props.showKey ? t("provider.hideKey") : t("provider.showKey")}
                </button>
              </div>
              <p className="bl-field-hint provider-connect__key-hint">{t("provider.local.apiKeyHint")}</p>
            </div>
          </details>

          <p className="body-sm" style={{ margin: "16px 0 0", color: "var(--ink-muted)" }}>
            {t("provider.local.capabilityNote")}
          </p>

          <div className="provider-connect__cta-row" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={props.onClear}
              disabled={props.busy}
            >
              {t("provider.clearConfig")}
            </button>
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

          {hasReadinessResults ? (
            <ReadinessChecklist
              readiness={props.readiness}
              titleKey="provider.readinessTitle"
              helpKey="provider.help.readinessLocal"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
