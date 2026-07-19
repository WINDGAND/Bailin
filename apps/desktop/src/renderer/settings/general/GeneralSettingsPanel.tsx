import { useState } from "react";
import { useT } from "../../shared/i18n/index.js";
import { useKeyboard } from "../../shared/keyboard.js";
import { useBailin } from "../../shared/use-bailin.js";
import { useConfirm, useToast } from "../../shared/feedback.js";
import { AppearanceSection } from "./AppearanceSection.js";
import { LanguageSection } from "../language/LanguageSection.js";
import { AboutSection } from "./AboutSection.js";

export function GeneralSettingsPanel(): JSX.Element {
  const t = useT();
  const kb = useKeyboard();
  const bailin = useBailin();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [clearing, setClearing] = useState(false);

  async function clearAll(): Promise<void> {
    const ok = await confirm({
      title: t("settings.clearAllTitle"),
      body: (
        <span>
          {t("settings.clearAllIntro")}
          <ul style={{ margin: "6px 0 0 18px", padding: 0, color: "var(--ink-soft)" }}>
            <li>{t("settings.clearAllItemCharacters")}</li>
            <li>{t("settings.clearAllItemMemory")}</li>
            <li>{t("settings.clearAllItemSettings")}</li>
          </ul>
          <p style={{ marginTop: 8 }}>{t("settings.clearAllIrreversible")}</p>
        </span>
      ),
      confirmLabel: t("settings.clearAllConfirm"),
      cancelLabel: t("common.thinkAgain"),
      danger: true,
      requireText: "DELETE"
    });
    if (!ok) return;
    setClearing(true);
    try {
      await bailin.memory.clearAll();
      showToast({ kind: "info", text: t("settings.toastAllCleared") });
    } catch (e) {
      showToast({
        kind: "error",
        text: t("settings.toastClearFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError")
        })
      });
    } finally {
      setClearing(false);
    }
  }

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

        <section className="forge-section" style={{ borderTop: "1px solid var(--hairline)", paddingTop: 24 }}>
          <div className="forge-section__head">
            <span className="bl-field-label">{t("settings.dangerSectionLabel")}</span>
            <span className="forge-section__lede">{t("settings.dangerSectionHint")}</span>
          </div>
          <p className="body-sm" style={{ margin: "0 0 16px", color: "var(--ink-soft)", maxWidth: 520 }}>
            {t("settings.dangerSectionNote")}
          </p>
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => void clearAll()}
            disabled={clearing}
          >
            {t("settings.clearAllData")}
          </button>
        </section>
      </div>
    </div>
  );
}
