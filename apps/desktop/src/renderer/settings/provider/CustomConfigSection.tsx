import { useState } from "react";
import type {
  ImageGenerationConfigDTO,
  ImageTierConfigDTO,
  ImageTierName
} from "../../../shared/ipc-contract.js";
import { BlSelect } from "../../shared/BlSelect.js";
import { FieldLabel } from "../../shared/FieldHelp.js";
import { ReadinessChecklist } from "./ReadinessChecklist.js";
import type { ReadinessMap } from "./apply-recommended-bundle.js";
import { ImageTierRow } from "./ImageTierRow.js";
import { useT } from "../../shared/i18n/index.js";

const IMAGE_TIERS: ImageTierName[] = ["economy", "standard", "premium"];

const TIER_KEYS: Record<ImageTierName, string> = {
  economy: "provider.tierEconomy",
  standard: "provider.tierStandard",
  premium: "provider.tierPremium"
};

export interface CustomConfigSectionProps {
  busy: boolean;
  apiKey: string;
  showKey: boolean;
  kind: "openai-compatible" | "anthropic-compatible";
  baseUrl: string;
  model: string;
  visionModel: string;
  webSearchModel: string;
  verifyProgress: string | null;
  readiness: ReadinessMap;
  imageConfig: ImageGenerationConfigDTO;
  imageApiKeyDraft: string;
  onApiKeyChange(v: string): void;
  onToggleShowKey(): void;
  onKindChange(kind: "openai-compatible" | "anthropic-compatible"): void;
  onBaseUrlChange(v: string): void;
  onModelChange(v: string): void;
  onVisionModelChange(v: string): void;
  onWebSearchModelChange(v: string): void;
  onVerify(): void;
  onClear(): void;
  onImageConfigChange(fn: (prev: ImageGenerationConfigDTO) => ImageGenerationConfigDTO): void;
  onImageApiKeyDraftChange(v: string): void;
  onUpdateImageTier(tier: ImageTierName, patch: Partial<ImageTierConfigDTO>): void;
  onClearImageKey(): void;
}

export function CustomConfigSection(props: CustomConfigSectionProps): JSX.Element {
  const t = useT();
  const [imageGenOpen, setImageGenOpen] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<ImageTierName, boolean>>({
    economy: false,
    standard: false,
    premium: false
  });

  const hasReadinessResults = Object.values(props.readiness).some((s) => s.status !== "idle");

  function tierLabel(tier: ImageTierName): string {
    return t(TIER_KEYS[tier]);
  }

  function toggleTierExpanded(tier: ImageTierName): void {
    setExpandedTiers((prev) => ({ ...prev, [tier]: !prev[tier] }));
  }

  return (
    <section className="forge-section provider-connect-section">
      <div className="forge-section__head">
        <span className="bl-field-label">{t("provider.custom.title")}</span>
        <span className="forge-section__lede">{t("provider.custom.lede")}</span>
      </div>

      <div className="provider-connect__surface">
        <div className="provider-custom-body">
          <div className="provider-connect__key-block">
            <FieldLabel htmlFor="custom-provider-key" help={t("provider.help.apiKey")}>
              {t("provider.apiKeyLabel")}
            </FieldLabel>
            <div className="input-group provider-connect__key-input">
              <input
                id="custom-provider-key"
                className="input input--provider-key"
                type={props.showKey ? "text" : "password"}
                value={props.apiKey}
                onChange={(e) => props.onApiKeyChange(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
              <div className="input-group__suffix">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={props.onToggleShowKey}
                  aria-label={props.showKey ? t("provider.hideKeyAria") : t("provider.showKeyAria")}
                >
                  {props.showKey ? t("provider.hideKey") : t("provider.showKey")}
                </button>
              </div>
            </div>
            <p className="bl-field-hint provider-connect__key-hint">{t("provider.apiKeyHint")}</p>
          </div>

          <div className="bl-provider-form-grid">
            <div className="bl-provider-form-field">
              <FieldLabel htmlFor="provider-kind" help={t("provider.help.protocol")}>
                {t("provider.protocolLabel")}
              </FieldLabel>
              <BlSelect
                id="provider-kind"
                value={props.kind}
                onChange={props.onKindChange}
                triggerClassName="select"
                options={[
                  { value: "openai-compatible", label: t("provider.protocolOpenAI") },
                  { value: "anthropic-compatible", label: t("provider.protocolAnthropic") }
                ]}
              />
            </div>
            <div className="bl-provider-form-field bl-provider-form-field--wide">
              <FieldLabel htmlFor="provider-base" help={t("provider.help.baseUrl")}>
                {t("provider.baseUrlLabel")}
              </FieldLabel>
              <input
                id="provider-base"
                className="input"
                value={props.baseUrl}
                onChange={(e) => props.onBaseUrlChange(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="bl-provider-form-field">
              <FieldLabel htmlFor="provider-model" help={t("provider.help.mainModel")}>
                {t("provider.mainModelLabel")}
              </FieldLabel>
              <input
                id="provider-model"
                className="input"
                value={props.model}
                onChange={(e) => props.onModelChange(e.target.value)}
                placeholder={t("provider.mainModelPlaceholder")}
              />
            </div>
          </div>

          <details
            className="forge-disclosure"
            open={optionalOpen}
            onToggle={(e) => setOptionalOpen(e.currentTarget.open)}
          >
            <summary>{t("provider.optionalModelsTitle")}</summary>
            <div className="bl-provider-form-grid" style={{ marginTop: 12 }}>
              <div className="bl-provider-form-field">
                <FieldLabel htmlFor="provider-vision" help={t("provider.help.visionModel")}>
                  {t("provider.visionModelLabel")}
                </FieldLabel>
                <input
                  id="provider-vision"
                  className="input"
                  value={props.visionModel}
                  onChange={(e) => props.onVisionModelChange(e.target.value)}
                  placeholder={t("provider.visionModelPlaceholder")}
                />
              </div>
              <div className="bl-provider-form-field bl-provider-form-field--wide">
                <FieldLabel htmlFor="provider-web" help={t("provider.help.webSearchModel")}>
                  {t("provider.webSearchModelLabel")}
                </FieldLabel>
                <input
                  id="provider-web"
                  className="input"
                  value={props.webSearchModel}
                  onChange={(e) => props.onWebSearchModelChange(e.target.value)}
                  placeholder={t("provider.webSearchModelPlaceholder")}
                />
              </div>
            </div>
          </details>

          <details
            className="forge-disclosure"
            open={imageGenOpen}
            onToggle={(e) => setImageGenOpen(e.currentTarget.open)}
          >
            <summary>{t("provider.imageGenTitle")}</summary>

            <div className="provider-custom-body">
              <p className="forge-section__lede">
                {props.imageConfig.useLLMProvider
                  ? t("provider.imageGenLedeReuse")
                  : t("provider.imageGenLedeIndependent")}
              </p>

              <label className="row gap-2" style={{ alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={props.imageConfig.useLLMProvider}
                  onChange={(e) =>
                    props.onImageConfigChange((prev) => ({
                      ...prev,
                      useLLMProvider: e.target.checked
                    }))
                  }
                />
                <span className="bl-field-label" style={{ marginBottom: 0 }}>
                  {t("provider.reuseLLMProvider")}
                </span>
                <span className="body-sm" style={{ color: "var(--ink-faint)" }}>
                  {t("provider.reuseLLMHint")}
                </span>
              </label>

              {!props.imageConfig.useLLMProvider ? (
                <>
                  <div>
                    <label className="bl-field-label" htmlFor="image-base-url">
                      {t("provider.imageBaseUrlLabel")}
                    </label>
                    <input
                      id="image-base-url"
                      className="input"
                      value={props.imageConfig.baseUrl ?? ""}
                      onChange={(e) =>
                        props.onImageConfigChange((prev) => ({ ...prev, baseUrl: e.target.value }))
                      }
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>
                  <div>
                    <label className="bl-field-label" htmlFor="image-api-key">
                      {t("provider.imageApiKeyLabel")}
                    </label>
                    <input
                      id="image-api-key"
                      className="input"
                      type="password"
                      value={props.imageApiKeyDraft}
                      onChange={(e) => props.onImageApiKeyDraftChange(e.target.value)}
                      placeholder={t("provider.imageApiKeyPlaceholder")}
                      autoComplete="off"
                    />
                  </div>
                </>
              ) : null}

              <div className="bl-default-tier-row">
                <FieldLabel help={t("provider.help.defaultTier")} className="bl-default-tier-row__label">
                  {t("provider.defaultTierLabel")}
                </FieldLabel>
                <div className="segmented bl-default-tier-row__control">
                  {IMAGE_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      className={
                        props.imageConfig.defaultTier === tier
                          ? "segmented__item is-active"
                          : "segmented__item"
                      }
                      onClick={() =>
                        props.onImageConfigChange((prev) => ({ ...prev, defaultTier: tier }))
                      }
                    >
                      {tierLabel(tier)}
                    </button>
                  ))}
                </div>
              </div>

              <FieldLabel help={t("provider.help.imageTiers")}>{t("provider.imageGenTitle")}</FieldLabel>
              <p className="bl-field-hint tier-list__lede">{t("provider.imageTierCostLede")}</p>

              <div className="tier-list">
                <div className="tier-list__head" aria-hidden>
                  <span>{t("provider.tierColumnLabel")}</span>
                  <span>{t("provider.modelColumnLabel")}</span>
                  <span>{t("provider.imageParamsToggle")}</span>
                </div>
                {IMAGE_TIERS.map((tier) => (
                  <ImageTierRow
                    key={tier}
                    tier={tier}
                    tierLabel={tierLabel(tier)}
                    cfg={props.imageConfig.tiers[tier]}
                    expanded={expandedTiers[tier]}
                    onToggleExpand={() => toggleTierExpanded(tier)}
                    onUpdate={(patch) => props.onUpdateImageTier(tier, patch)}
                  />
                ))}
              </div>

              <div className="bl-action-bar">
                <div className="bl-action-bar__left">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => props.onClearImageKey()}
                    disabled={props.imageConfig.useLLMProvider}
                  >
                    {t("provider.clearImageKey")}
                  </button>
                </div>
              </div>
            </div>
          </details>

          <div className="provider-connect__cta-row" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={props.onClear}
              disabled={props.busy || !props.apiKey}
            >
              {t("provider.clearConfig")}
            </button>
            <button
              type="button"
              className="btn btn--magenta provider-connect__cta"
              onClick={props.onVerify}
              disabled={props.busy || !props.apiKey.trim()}
              data-hint={!props.apiKey ? t("provider.fillKeyFirst") : ""}
            >
              {props.busy ? t("provider.verifyRunning") : t("provider.saveAndVerify")}
            </button>
          </div>

          {props.verifyProgress ? (
            <p className="bl-one-click-progress">{props.verifyProgress}</p>
          ) : null}

          {hasReadinessResults ? (
            <ReadinessChecklist readiness={props.readiness} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
