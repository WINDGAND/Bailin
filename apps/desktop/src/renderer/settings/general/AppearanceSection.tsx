import { useTheme } from "../../shared/theme/index.js";
import { useT } from "../../shared/i18n/index.js";
import { OptionGroup } from "../../shared/option-group.js";
import type { ThemePreference } from "../../shared/theme/core.js";
import { useReducedMotion } from "../../shared/use-reduced-motion.js";
import {
  MoonIcon,
  SunIcon,
  SunMoonIcon,
  useHostedAnimatedIcon
} from "../../shared/animated-icons/index.js";

export function AppearanceSection(): JSX.Element {
  const t = useT();
  const { preference, setTheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const lightIcon = useHostedAnimatedIcon(reducedMotion);
  const darkIcon = useHostedAnimatedIcon(reducedMotion);
  const systemIcon = useHostedAnimatedIcon(reducedMotion);

  return (
    <OptionGroup<ThemePreference>
      value={preference}
      onChange={(v) => void setTheme(v)}
      ariaLabel={t("settings.appearanceSectionLabel")}
      className="forge-mode forge-mode--triple"
      itemClassName="forge-mode__card"
      options={[
        {
          value: "light",
          label: t("settings.themeLight"),
          caption: t("settings.themeLightCaption"),
          icon: <SunIcon ref={lightIcon.ref} size={18} />,
          onMouseEnter: lightIcon.onMouseEnter,
          onMouseLeave: lightIcon.onMouseLeave
        },
        {
          value: "dark",
          label: t("settings.themeDark"),
          caption: t("settings.themeDarkCaption"),
          icon: <MoonIcon ref={darkIcon.ref} size={18} />,
          onMouseEnter: darkIcon.onMouseEnter,
          onMouseLeave: darkIcon.onMouseLeave
        },
        {
          value: "system",
          label: t("settings.themeSystem"),
          caption: t("settings.themeSystemCaption"),
          icon: <SunMoonIcon ref={systemIcon.ref} size={18} />,
          onMouseEnter: systemIcon.onMouseEnter,
          onMouseLeave: systemIcon.onMouseLeave
        }
      ]}
    />
  );
}
