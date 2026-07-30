import { useT } from "../../shared/i18n/index.js";

export type ProviderMode = "ohmygpt" | "local" | "custom";

const STORAGE_KEY = "bailin.providerMode";

export function readProviderMode(): ProviderMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "custom" || v === "local" || v === "ohmygpt") return v;
    return "ohmygpt";
  } catch {
    return "ohmygpt";
  }
}

export function writeProviderMode(mode: ProviderMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

interface ProviderModeSwitchProps {
  mode: ProviderMode;
  onChange(mode: ProviderMode): void;
}

export function ProviderModeSwitch({ mode, onChange }: ProviderModeSwitchProps): JSX.Element {
  const t = useT();

  return (
    <div className="provider-mode-switch" role="tablist" aria-label={t("provider.modeSwitchAria")}>
      <div className="segmented provider-mode-switch__control">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ohmygpt"}
          className={mode === "ohmygpt" ? "segmented__item is-active" : "segmented__item"}
          onClick={() => onChange("ohmygpt")}
        >
          {t("provider.modeOhmygpt")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "local"}
          className={mode === "local" ? "segmented__item is-active" : "segmented__item"}
          onClick={() => onChange("local")}
        >
          {t("provider.modeLocal")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "custom"}
          className={mode === "custom" ? "segmented__item is-active" : "segmented__item"}
          onClick={() => onChange("custom")}
        >
          {t("provider.modeCustom")}
        </button>
      </div>
    </div>
  );
}
