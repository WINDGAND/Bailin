import { useTheme } from "../../shared/theme/index.js";
import { useT } from "../../shared/i18n/index.js";
import type { ThemePreference } from "../../shared/theme/core.js";

const OPTIONS: Array<{
  id: ThemePreference;
  labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem";
  captionKey:
    | "settings.themeLightCaption"
    | "settings.themeDarkCaption"
    | "settings.themeSystemCaption";
}> = [
  {
    id: "light",
    labelKey: "settings.themeLight",
    captionKey: "settings.themeLightCaption"
  },
  {
    id: "dark",
    labelKey: "settings.themeDark",
    captionKey: "settings.themeDarkCaption"
  },
  {
    id: "system",
    labelKey: "settings.themeSystem",
    captionKey: "settings.themeSystemCaption"
  }
];

export function AppearanceSection(): JSX.Element {
  const t = useT();
  const { preference, setTheme } = useTheme();

  return (
    <div className="forge-mode forge-mode--triple">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`forge-mode__card ${preference === opt.id ? "is-active" : ""}`}
          onClick={() => void setTheme(opt.id)}
        >
          <div className="forge-mode__title">{t(opt.labelKey)}</div>
          <div className="forge-mode__caption">{t(opt.captionKey)}</div>
        </button>
      ))}
    </div>
  );
}
