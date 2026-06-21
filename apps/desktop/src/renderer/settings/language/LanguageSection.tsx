import { useI18n } from "../../shared/i18n/index.js";
import { useToast } from "../../shared/feedback.js";
import { OptionGroup } from "../../shared/option-group.js";
import type { Locale } from "../../shared/i18n/types.js";

export function LanguageSection(): JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { showToast } = useToast();

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
        { value: "zh", label: t("language.zhLabel"), caption: t("language.zhCaption") },
        { value: "en", label: t("language.enLabel"), caption: t("language.enCaption") }
      ]}
    />
  );
}
