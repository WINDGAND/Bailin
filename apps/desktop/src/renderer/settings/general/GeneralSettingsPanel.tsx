import { useT } from "../../shared/i18n/index.js";
import { AppearanceSection } from "./AppearanceSection.js";
import { LanguageSection } from "../language/LanguageSection.js";

export function GeneralSettingsPanel(): JSX.Element {
  const t = useT();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 26 }}>
        <div className="eyebrow">{t("settings.eyebrow")}</div>
        <div className="display display--page">{t("settings.title")}</div>
        <p className="apple-page-subtitle">{t("settings.subtitle")}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <section className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("settings.appearanceSectionLabel")}</span>
            <span className="forge-section__lede">{t("settings.appearanceSectionHint")}</span>
          </div>
          <p className="body-sm" style={{ margin: "0 0 16px", color: "var(--ink-soft)", maxWidth: 520 }}>
            {t("settings.appearanceSectionNote")}
          </p>
          <AppearanceSection />
        </section>

        <section className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("settings.languageSectionLabel")}</span>
            <span className="forge-section__lede">{t("settings.languageSectionHint")}</span>
          </div>
          <p className="body-sm" style={{ margin: "0 0 16px", color: "var(--ink-soft)", maxWidth: 520 }}>
            {t("settings.languageSectionNote")}
          </p>
          <LanguageSection />
        </section>
      </div>
    </div>
  );
}
