import { useI18n } from "../../shared/i18n/index.js";
import { useToast } from "../../shared/feedback.js";
import type { Locale } from "../../shared/i18n/types.js";

const OPTIONS: Array<{ id: Locale; labelKey: "language.zhLabel" | "language.enLabel"; captionKey: "language.zhCaption" | "language.enCaption" }> = [
  { id: "zh", labelKey: "language.zhLabel", captionKey: "language.zhCaption" },
  { id: "en", labelKey: "language.enLabel", captionKey: "language.enCaption" }
];

export function LanguagePanel(): JSX.Element {
  const { locale, setLocale, t } = useI18n();
  const { showToast } = useToast();

  async function pick(next: Locale): Promise<void> {
    if (next === locale) return;
    await setLocale(next);
    showToast({ kind: "success", text: t("language.saved") });
  }

  return (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("language.eyebrow")}</div>
        <div className="display display--page">{t("language.title")}</div>
        <p className="apple-page-subtitle">{t("language.subtitle")}</p>
      </div>

      <div style={{ maxWidth: 760 }}>
        <p className="body-md" style={{ margin: "0 0 20px", maxWidth: 520 }}>
          {t("language.hint")}
        </p>

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
      </div>
    </div>
  );
}
