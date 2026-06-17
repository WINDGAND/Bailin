import { useI18n } from "../../shared/i18n/index.js";
import { useToast } from "../../shared/feedback.js";
import type { Locale } from "../../shared/i18n/types.js";

const OPTIONS: Array<{
  id: Locale;
  labelKey: "language.zhLabel" | "language.enLabel";
  captionKey: "language.zhCaption" | "language.enCaption";
}> = [
  { id: "zh", labelKey: "language.zhLabel", captionKey: "language.zhCaption" },
  { id: "en", labelKey: "language.enLabel", captionKey: "language.enCaption" }
];

export function LanguageSection(): JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { showToast } = useToast();

  async function pick(next: Locale): Promise<void> {
    if (next === locale) return;
    await setLocale(next);
    showToast({ kind: "success", text: t("language.saved") });
  }

  return (
    <div className="forge-mode" style={{ maxWidth: 560 }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`forge-mode__card ${locale === opt.id ? "is-active" : ""}`}
          onClick={() => void pick(opt.id)}
        >
          <div className="forge-mode__title">{t(opt.labelKey)}</div>
          <div className="forge-mode__caption">{t(opt.captionKey)}</div>
        </button>
      ))}
    </div>
  );
}
