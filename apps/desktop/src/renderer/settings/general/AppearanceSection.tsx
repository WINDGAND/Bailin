import { useTheme } from "../../shared/theme/index.js";
import { useT } from "../../shared/i18n/index.js";
import { OptionGroup } from "../../shared/option-group.js";
import type { ThemePreference } from "../../shared/theme/core.js";

export function AppearanceSection(): JSX.Element {
  const t = useT();
  const { preference, setTheme } = useTheme();

  return (
    <OptionGroup<ThemePreference>
      value={preference}
      onChange={(v) => void setTheme(v)}
      ariaLabel={t("settings.appearanceSectionLabel")}
      className="forge-mode forge-mode--triple"
      itemClassName="forge-mode__card"
      options={[
        { value: "light", label: t("settings.themeLight"), caption: t("settings.themeLightCaption") },
        { value: "dark", label: t("settings.themeDark"), caption: t("settings.themeDarkCaption") },
        { value: "system", label: t("settings.themeSystem"), caption: t("settings.themeSystemCaption") }
      ]}
    />
  );
}
