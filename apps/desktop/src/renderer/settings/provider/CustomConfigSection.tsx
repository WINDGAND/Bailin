import { useState } from "react";
import type {
  ImageGenerationConfigDTO,
  ImageTierConfigDTO,
  ImageTierName
} from "../../../shared/ipc-contract.js";
import { BlSelect } from "../../shared/BlSelect.js";
import { FieldLabel } from "../../shared/FieldHelp.js";
import {
  ConnStrip,
  NetStrip,
  VisionStrip,
  type ConnStatus,
  type WebProbe,
  type VisionProbe
} from "./provider-strips.js";
import { useT } from "../../shared/i18n/index.js";

const IMAGE_TIERS: ImageTierName[] = ["economy", "standard", "premium"];

const TIER_KEYS: Record<ImageTierName, string> = {
  economy: "provider.tierEconomy",
  standard: "provider.tierStandard",
  premium: "provider.tierPremium"
};

export interface CustomConfigSectionProps {
  deviatedFromBundle: boolean;
  dirty: boolean;
  busy: boolean;
  apiKey: string;
  keyMasked: string;
  kind: "openai-compatible" | "anthropic-compatible";
  baseUrl: string;
  model: string;
  visionModel: string;
  status: ConnStatus;
  caps: { webSearch: boolean; reason: string } | null;
  probe: WebProbe;
  vision: { vision: boolean; reason: string } | null;
  visionProbe: VisionProbe;
  isAnthropic: boolean;
  readyForDeep: boolean;
  imageConfig: ImageGenerationConfigDTO;
  imageApiKeyDraft: string;
  imageBusy: ImageTierName | "save" | null;
  imageStatus:
    | null
    | { kind: "ok"; reason: string }
    | { kind: "error"; reason: string }
    | { kind: "test"; tier: ImageTierName; model?: string; latencyMs?: number; cost?: number };
  onKindChange(kind: "openai-compatible" | "anthropic-compatible"): void;
  onBaseUrlChange(v: string): void;
  onModelChange(v: string): void;
  onVisionModelChange(v: string): void;
  onProbeWeb(): void;
  onProbeVision(): void;
  onSaveAdvanced(): void;
  onImageConfigChange(fn: (prev: ImageGenerationConfigDTO) => ImageGenerationConfigDTO): void;
  onImageApiKeyDraftChange(v: string): void;
  onUpdateImageTier(tier: ImageTierName, patch: Partial<ImageTierConfigDTO>): void;
  onTestImageTier(tier: ImageTierName): void;
  onSaveImageConfig(): void;
  onClearImageKey(): void;
}

export function CustomConfigSection(props: CustomConfigSectionProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [imageGenOpen, setImageGenOpen] = useState(true);

  function tierLabel(tier: ImageTierName): string {
    return t(TIER_KEYS[tier]);
  }

  return (
    <section className="forge-section">
      <details
        className="forge-disclosure"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary>{t("provider.custom.title")}</summary>

        <div className="provider-custom-body">
          <p className="forge-section__lede">{t("provider.custom.lede")}</p>

          <div>
            <div className="bl-field-label" style={{ marginBottom: 8 }}>
              {t("provider.custom.whenNeededTitle")}
            </div>
            <div className="provider-when-chips">
              <span className="bl-tag bl-tag--skeleton">{t("provider.custom.whenNeeded1")}</span>
              <span className="bl-tag bl-tag--skeleton">{t("provider.custom.whenNeeded2")}</span>
              <span className="bl-tag bl-tag--skeleton">{t("provider.custom.whenNeeded3")}</span>
            </div>
          </div>

          {props.deviatedFromBundle ? (
            <p className="body-sm bl-deviated-banner">{t("provider.deviatedFromBundle")}</p>
          ) : null}

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
            <div className="bl-provider-form-field">
              <FieldLabel htmlFor="provider-vision" help={t("provider.help.visionModel")}>
                {t("provider.visionModelLabel")}
              </FieldLabel>
              <p className="bl-field-hint bl-provider-form-field__hint">{t("provider.visionModelHint")}</p>
              <input
                id="provider-vision"
                className="input"
                value={props.visionModel}
                onChange={(e) => props.onVisionModelChange(e.target.value)}
                placeholder={t("provider.visionModelPlaceholder")}
              />
            </div>
          </div>

          <div className="bl-provider-status-block">
            <FieldLabel help={t("provider.help.connStatus")}>{t("provider.connStatusLabel")}</FieldLabel>
            <ConnStrip status={props.status} apiKey={props.apiKey} keyMasked={props.keyMasked} />
            <NetStrip
              caps={props.caps}
              probe={props.probe}
              disabled={!props.apiKey || props.isAnthropic}
              disabledHint={
                props.isAnthropic ? t("provider.anthropicNetHint") : t("provider.fillKeyFirst")
              }
              onProbe={props.onProbeWeb}
              helpText={t("provider.help.webSearch")}
            />
            <VisionStrip
              vision={props.vision}
              visionProbe={props.visionProbe}
              visionModel={props.visionModel}
              disabled={!props.apiKey}
              onProbe={props.onProbeVision}
            />
            {props.readyForDeep ? (
              <div className="bl-status-strip is-ok">
                <div className="bl-status-strip__body">
                  <div className="bl-status-strip__title">{t("provider.readyForDeepTitle")}</div>
                  <div className="bl-status-strip__detail">{t("provider.readyForDeepDetail")}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bl-action-bar">
            <div className="bl-action-bar__left" />
            <div className="bl-action-bar__right">
              {props.dirty ? <span className="bl-dirty-dot">{t("provider.unsaved")}</span> : null}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => props.onSaveAdvanced()}
                disabled={props.busy || !props.apiKey}
              >
                {props.busy ? t("provider.saveTesting") : t("provider.saveAndTest")}
              </button>
            </div>
          </div>

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

              <div className="tier-list">
                {IMAGE_TIERS.map((tier) => {
                  const cfg = props.imageConfig.tiers[tier];
                  return (
                    <div className="tier-row" key={tier}>
                      <div className="tier-row__label">
                        <strong>{tierLabel(tier)}</strong>
                        <span>
                          ${(cfg.estimatedCostUsd ?? 0).toFixed(3)} {t("provider.perImage")}
                        </span>
                      </div>
                      <input
                        className="input input--inline"
                        value={cfg.model}
                        onChange={(e) => props.onUpdateImageTier(tier, { model: e.target.value })}
                        placeholder={t("provider.modelNamePlaceholder")}
                      />
                      <BlSelect
                        className="bl-select--inline"
                        triggerClassName="select select--inline"
                        value={cfg.quality ?? "medium"}
                        onChange={(quality) =>
                          props.onUpdateImageTier(tier, {
                            quality: quality as ImageTierConfigDTO["quality"]
                          })
                        }
                        options={[
                          { value: "low", label: "low" },
                          { value: "medium", label: "medium" },
                          { value: "high", label: "high" },
                          { value: "standard", label: "standard" },
                          { value: "hd", label: "hd" }
                        ]}
                      />
                      <BlSelect
                        className="bl-select--inline"
                        triggerClassName="select select--inline"
                        value={cfg.size ?? "1024x1024"}
                        onChange={(size) =>
                          props.onUpdateImageTier(tier, {
                            size: size as ImageTierConfigDTO["size"]
                          })
                        }
                        options={[
                          { value: "1024x1024", label: "1024x1024" },
                          { value: "1024x1536", label: "1024x1536" },
                          { value: "1536x1024", label: "1536x1024" }
                        ]}
                      />
                      <input
                        className="input input--inline input--price"
                        type="number"
                        min={0}
                        step={0.001}
                        value={cfg.estimatedCostUsd ?? 0}
                        onChange={(e) =>
                          props.onUpdateImageTier(tier, {
                            estimatedCostUsd: Number(e.target.value)
                          })
                        }
                      />
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => props.onTestImageTier(tier)}
                        disabled={props.imageBusy != null}
                      >
                        {props.imageBusy === tier ? t("provider.testing") : t("provider.test")}
                      </button>
                    </div>
                  );
                })}
              </div>

              {props.imageStatus ? (
                <div
                  className={
                    props.imageStatus.kind === "error"
                      ? "bl-status-strip is-error"
                      : "bl-status-strip is-ok"
                  }
                >
                  <div className="bl-status-strip__body">
                    <div className="bl-status-strip__detail">
                      {props.imageStatus.kind === "test"
                        ? t("provider.imageTestSuccess", {
                            tier: tierLabel(props.imageStatus.tier),
                            model: props.imageStatus.model ?? "unknown",
                            latency: props.imageStatus.latencyMs ?? "?",
                            cost: (props.imageStatus.cost ?? 0).toFixed(3)
                          })
                        : props.imageStatus.reason}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="bl-action-bar">
                <div className="bl-action-bar__left">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => props.onClearImageKey()}
                    disabled={props.imageConfig.useLLMProvider || props.imageBusy != null}
                  >
                    {t("provider.clearImageKey")}
                  </button>
                </div>
                <div className="bl-action-bar__right">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => props.onSaveImageConfig()}
                    disabled={props.imageBusy != null}
                  >
                    {props.imageBusy === "save"
                      ? t("provider.savingImageConfig")
                      : t("provider.saveImageConfig")}
                  </button>
                </div>
              </div>
            </div>
          </details>
        </div>
      </details>
    </section>
  );
}
