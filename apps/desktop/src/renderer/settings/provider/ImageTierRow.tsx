import { useMemo, useState } from "react";
import type {
  ImageTierConfigDTO,
  ImageTierName,
  ImageTierParamMode
} from "../../../shared/ipc-contract.js";
import { BlSelect } from "../../shared/BlSelect.js";
import { FieldLabel } from "../../shared/FieldHelp.js";
import { useT } from "../../shared/i18n/index.js";
import { parseCustomBodyJson, suggestParamModeForModel } from "./image-tier-validation.js";

const UNSET = "__unset__";
const CUSTOM = "__custom__";

const PRESET_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;
const PRESET_QUALITIES = ["low", "medium", "high", "standard", "hd"] as const;

const PARAM_MODES: ImageTierParamMode[] = ["openaiImages", "providerDefault", "custom"];

const PARAM_MODE_KEYS: Record<ImageTierParamMode, string> = {
  openaiImages: "provider.imageParamModeOpenai",
  providerDefault: "provider.imageParamModeProviderDefault",
  custom: "provider.imageParamModeCustom"
};

export interface ImageTierRowProps {
  tier: ImageTierName;
  tierLabel: string;
  cfg: ImageTierConfigDTO;
  expanded: boolean;
  onToggleExpand(): void;
  onUpdate(patch: Partial<ImageTierConfigDTO>): void;
}

export function ImageTierRow(props: ImageTierRowProps): JSX.Element {
  const t = useT();
  const paramMode = props.cfg.paramMode ?? "openaiImages";
  const [customSizeDraft, setCustomSizeDraft] = useState(
    () => (props.cfg.size && !PRESET_SIZES.includes(props.cfg.size as (typeof PRESET_SIZES)[number])
      ? props.cfg.size
      : "")
  );
  const [customBodyText, setCustomBodyText] = useState(() =>
    JSON.stringify(props.cfg.customBody ?? {}, null, 2)
  );
  const [customBodyError, setCustomBodyError] = useState<string | null>(null);

  const modelHint = useMemo(() => {
    const suggested = suggestParamModeForModel(props.cfg.model);
    if (!suggested || suggested === paramMode) return null;
    return suggested === "openaiImages"
      ? t("provider.imageModelHintOpenai")
      : t("provider.imageModelHintProviderDefault");
  }, [props.cfg.model, paramMode, t]);

  const sizeSelectValue = useMemo(() => {
    if (!props.cfg.size) return UNSET;
    if (PRESET_SIZES.includes(props.cfg.size as (typeof PRESET_SIZES)[number])) {
      return props.cfg.size;
    }
    return CUSTOM;
  }, [props.cfg.size]);

  function handleParamModeChange(mode: ImageTierParamMode): void {
    if (mode === "custom") {
      const body = props.cfg.customBody ?? {};
      setCustomBodyText(JSON.stringify(body, null, 2));
      setCustomBodyError(null);
      props.onUpdate({ paramMode: mode, customBody: body });
      return;
    }
    props.onUpdate({ paramMode: mode });
  }

  function handleCustomBodyChange(text: string): void {
    setCustomBodyText(text);
    const parsed = parseCustomBodyJson(text);
    if (!parsed.ok) {
      setCustomBodyError(t("provider.imageCustomBodyInvalid"));
      props.onUpdate({ customBody: undefined });
      return;
    }
    setCustomBodyError(null);
    props.onUpdate({ customBody: parsed.value });
  }

  return (
    <div className="tier-row">
      <div className="tier-row__main">
        <div className="tier-row__label">
          <strong>{props.tierLabel}</strong>
          <span className="tier-row__cost">
            {t("provider.imageCostEstimateShort", {
              cost: (props.cfg.estimatedCostUsd ?? 0).toFixed(3)
            })}
          </span>
        </div>
        <input
          className="input input--inline"
          value={props.cfg.model}
          onChange={(e) => props.onUpdate({ model: e.target.value })}
          placeholder={t("provider.modelNamePlaceholder")}
          aria-label={t("provider.imageModelInputAria", { tier: props.tierLabel })}
        />
        <button
          type="button"
          className={`btn btn--ghost btn--sm tier-row__expand${props.expanded ? " is-open" : ""}`}
          onClick={props.onToggleExpand}
          aria-expanded={props.expanded}
        >
          {t("provider.imageParamsToggle")}
        </button>
      </div>

      {modelHint ? <p className="bl-field-hint tier-row__hint">{modelHint}</p> : null}

      {props.expanded ? (
        <div className="tier-row__advanced">
          <div className="tier-row__mode-row">
            <FieldLabel help={t("provider.imageParamModeHelp")} className="tier-row__mode-label">
              {t("provider.imageParamModeLabel")}
            </FieldLabel>
            <div className="segmented tier-row__mode-control">
              {PARAM_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={
                    paramMode === mode ? "segmented__item is-active" : "segmented__item"
                  }
                  onClick={() => handleParamModeChange(mode)}
                >
                  {t(PARAM_MODE_KEYS[mode])}
                </button>
              ))}
            </div>
          </div>

          {paramMode === "openaiImages" ? (
            <div className="tier-row__openai-grid">
              <div>
                <label className="bl-field-label">{t("provider.imageQualityLabel")}</label>
                <BlSelect
                  className="bl-select--inline"
                  triggerClassName="select select--inline"
                  value={props.cfg.quality ?? UNSET}
                  onChange={(quality) =>
                    props.onUpdate({
                      quality: quality === UNSET ? undefined : quality
                    })
                  }
                  options={[
                    { value: UNSET, label: t("provider.imageQualityUnset") },
                    ...PRESET_QUALITIES.map((q) => ({ value: q, label: q }))
                  ]}
                />
              </div>
              <div>
                <label className="bl-field-label">{t("provider.imageSizeLabel")}</label>
                <BlSelect
                  className="bl-select--inline"
                  triggerClassName="select select--inline"
                  value={sizeSelectValue}
                  onChange={(size) => {
                    if (size === UNSET) {
                      props.onUpdate({ size: undefined });
                      setCustomSizeDraft("");
                      return;
                    }
                    if (size === CUSTOM) {
                      props.onUpdate({ size: customSizeDraft || undefined });
                      return;
                    }
                    props.onUpdate({ size });
                  }}
                  options={[
                    { value: UNSET, label: t("provider.imageQualityUnset") },
                    ...PRESET_SIZES.map((s) => ({ value: s, label: s })),
                    { value: CUSTOM, label: t("provider.imageSizeCustom") }
                  ]}
                />
                {sizeSelectValue === CUSTOM ? (
                  <input
                    className="input input--inline tier-row__custom-size"
                    value={customSizeDraft}
                    onChange={(e) => {
                      setCustomSizeDraft(e.target.value);
                      props.onUpdate({ size: e.target.value || undefined });
                    }}
                    placeholder="1792x1024"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {paramMode === "providerDefault" ? (
            <p className="bl-field-hint">{t("provider.imageProviderDefaultHint")}</p>
          ) : null}

          {paramMode === "custom" ? (
            <div className="tier-row__custom-json">
              <FieldLabel help={t("provider.imageCustomBodyHelp")}>
                {t("provider.imageCustomBodyLabel")}
              </FieldLabel>
              <textarea
                className="input tier-row__json-input"
                rows={5}
                value={customBodyText}
                onChange={(e) => handleCustomBodyChange(e.target.value)}
                placeholder={t("provider.imageCustomBodyPlaceholder")}
                spellCheck={false}
              />
              {customBodyError ? (
                <p className="bl-field-hint bl-field-hint--error">{customBodyError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
