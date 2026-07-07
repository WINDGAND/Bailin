import { useT } from "../../shared/i18n/index.js";
import { useKeyboard } from "../../shared/keyboard.js";
import { AppearanceSection } from "./AppearanceSection.js";
import { LanguageSection } from "../language/LanguageSection.js";
import { AboutSection } from "./AboutSection.js";

export function GeneralSettingsPanel(): JSX.Element {
  const t = useT();
  const kb = useKeyboard();

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

        <section className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("settings.shortcutsSectionLabel")}</span>
            <span className="forge-section__lede">{t("settings.shortcutsSectionHint")}</span>
          </div>
          <p className="body-sm" style={{ margin: "0 0 16px", color: "var(--ink-soft)", maxWidth: 520 }}>
            {t("settings.shortcutsSectionNote")}
          </p>
          <button
            type="button"
            className="settings-shortcuts__open"
            onClick={() => kb.openHelp()}
          >
            <span className="kbd">?</span>
            <span>{t("keyboard.discoverHint")}</span>
          </button>
        </section>

        <section className="forge-section">
          <div className="forge-section__head">
            <span className="bl-field-label">{t("update.aboutSectionLabel")}</span>
            <span className="forge-section__lede">{t("update.aboutSectionHint")}</span>
          </div>
          <AboutSection />
        </section>
      </div>
    </div>
  );
}
