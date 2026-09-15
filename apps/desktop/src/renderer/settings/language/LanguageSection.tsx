import { useI18n } from "../../shared/i18n/index.js";
import { useToast } from "../../shared/feedback.js";
import { OptionGroup } from "../../shared/option-group.js";
import type { Locale } from "../../shared/i18n/types.js";
import { useReducedMotion } from "../../shared/use-reduced-motion.js";
import { LanguagesIcon, useHostedAnimatedIcon } from "../../shared/animated-icons/index.js";

export function LanguageSection(): JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { showToast } = useToast();
  const reducedMotion = useReducedMotion();
  const zhIcon = useHostedAnimatedIcon(reducedMotion);
  const enIcon = useHostedAnimatedIcon(reducedMotion);

  async function pick(next: Locale): Promise<void> {
    if (next === locale) return;
    await setLocale(next);
    showToast({ kind: "success", text: t("language.saved") });
  }

  return (
    <OptionGroup<Locale>
      value={locale}
      onChange={(v) => void pick(v)}
      ariaLabel={t("settings.languageSectionLabel")}
      className="forge-mode"
      itemClassName="forge-mode__card"
      options={[
        {
          value: "zh",
          label: t("language.zhLabel"),
          caption: t("language.zhCaption"),
          icon: <LanguagesIcon ref={zhIcon.ref} size={18} />,
          onMouseEnter: zhIcon.onMouseEnter,
          onMouseLeave: zhIcon.onMouseLeave
        },
        {
          value: "en",
          label: t("language.enLabel"),
          caption: t("language.enCaption"),
          icon: <LanguagesIcon ref={enIcon.ref} size={18} />,
          onMouseEnter: enIcon.onMouseEnter,
          onMouseLeave: enIcon.onMouseLeave
        }
      ]}
    />
  );
}
