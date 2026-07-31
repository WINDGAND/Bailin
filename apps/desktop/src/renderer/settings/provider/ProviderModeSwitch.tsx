import { useT } from "../../shared/i18n/index.js";

export type ProviderMode = "cloud" | "local" | "custom";

const STORAGE_KEY = "bailin.providerMode";

/** 读取并迁移旧值 `ohmygpt` → `cloud`。 */
export function readProviderMode(): ProviderMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "custom" || v === "local" || v === "cloud") return v;
    if (v === "ohmygpt") {
      localStorage.setItem(STORAGE_KEY, "cloud");
      return "cloud";
    }
    return "cloud";
  } catch {
    return "cloud";
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
  /** `null` = 尚未选择（首启），三档均不高亮 */
  mode: ProviderMode | null;
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
          aria-selected={mode === "cloud"}
          className={mode === "cloud" ? "segmented__item is-active" : "segmented__item"}
          onClick={() => onChange("cloud")}
        >
          {t("provider.modeCloud")}
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
