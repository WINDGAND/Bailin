import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useShortcut, useKeyboard } from "../../shared/keyboard.js";
import { useConfirm } from "../../shared/feedback.js";
import { SetupWizard } from "../setup/SetupWizard.js";
import { CharacterLibrary } from "../library/CharacterLibrary.js";
import { CreateCharacter } from "../create/CreateCharacter.js";
import { MemoryPanel } from "../memory/MemoryPanel.js";
import { ApiKeyPanel } from "../provider/ApiKeyPanel.js";
import { DesktopBehaviorPanel } from "../desktop/DesktopBehaviorPanel.js";
import { LanguagePanel } from "../language/LanguagePanel.js";
import { DirtyContext, type DirtyContextValue } from "./dirty-context.js";
import { VisualJobProvider } from "./visual-job-context.js";
import { VisualJobBanner } from "./VisualJobBanner.js";
import { useI18n } from "../../shared/i18n/index.js";

type Tab = "library" | "create" | "memory" | "desktop" | "key" | "language";

interface TabDef {
  id: Tab;
  labelKey: "nav.library" | "nav.create" | "nav.memory" | "nav.desktop" | "nav.key" | "nav.language";
  icon: (props: { size?: number }) => JSX.Element;
}

const TABS: TabDef[] = [
  { id: "library", labelKey: "nav.library", icon: LibraryIcon },
  { id: "create", labelKey: "nav.create", icon: ForgeIcon },
  { id: "memory", labelKey: "nav.memory", icon: MemoryIcon },
  { id: "desktop", labelKey: "nav.desktop", icon: CompanionIcon },
  { id: "key", labelKey: "nav.key", icon: KeyIcon },
  { id: "language", labelKey: "nav.language", icon: LanguageIcon }
];

export function SettingsApp(): JSX.Element {
  const nuwa = useNuwa();
  const { t, ready: i18nReady } = useI18n();
  const kb = useKeyboard();
  const confirm = useConfirm();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const dirtyRef = useRef(false);

  useEffect(() => {
    void nuwa.app.isFirstRun().then((v) => setFirstRun(v));
  }, [nuwa]);

  const dirtyCtx = useMemo<DirtyContextValue>(
    () => ({
      setDirty: (d: boolean) => {
        dirtyRef.current = d;
      }
    }),
    []
  );

  const tryGoTab = useCallback(
    async (next: Tab) => {
      if (next === tab) return;
      if (dirtyRef.current) {
        const ok = await confirm({
          title: t("common.discardTitle"),
          body: t("common.discardBody"),
          confirmLabel: t("common.discardConfirm"),
          cancelLabel: t("common.discardCancel"),
          danger: true
        });
        if (!ok) return;
        dirtyRef.current = false;
      }
      setTab(next);
    },
    [tab, confirm, t]
  );

  useShortcut({
    id: "tab-1",
    combo: "1",
    scope: "Settings",
    label: t("nav.library"),
    handler: () => void tryGoTab("library")
  });
  useShortcut({
    id: "tab-2",
    combo: "2",
    scope: "Settings",
    label: t("nav.create"),
    handler: () => void tryGoTab("create")
  });
  useShortcut({
    id: "tab-3",
    combo: "3",
    scope: "Settings",
    label: t("nav.memory"),
    handler: () => void tryGoTab("memory")
  });
  useShortcut({
    id: "tab-4",
    combo: "4",
    scope: "Settings",
    label: t("nav.desktop"),
    handler: () => void tryGoTab("desktop")
  });
  useShortcut({
    id: "tab-5",
    combo: "5",
    scope: "Settings",
    label: t("nav.key"),
    handler: () => void tryGoTab("key")
  });
  useShortcut({
    id: "tab-6",
    combo: "6",
    scope: "Settings",
    label: t("nav.language"),
    handler: () => void tryGoTab("language")
  });
  useShortcut({
    id: "help",
    combo: "?",
    scope: "Settings",
    label: "查看快捷键",
    handler: () => kb.openHelp()
  });

  if (firstRun === null || !i18nReady) {
    return (
      <div style={{ padding: 40 }}>
        <div className="display display--page">{t("common.loading")}</div>
      </div>
    );
  }

  if (firstRun) {
    return (
      <SetupWizard
        onDone={async () => {
          await nuwa.app.completeFirstRun();
          setFirstRun(false);
        }}
      />
    );
  }

  return (
    <DirtyContext.Provider value={dirtyCtx}>
      <VisualJobProvider>
        <div className="settings-shell">
          <aside className="settings-sidebar" aria-label={t("common.settingsSidebar")}>
            <div className="settings-brand">
              <div className="eyebrow">Bailin · 0.0.1</div>
              <div className="display display--section" style={{ marginTop: 4 }}>
                百灵
              </div>
            </div>

            <nav className="settings-nav" aria-label={t("common.settingsNav")}>
              {TABS.map((tabDef) => (
                <button
                  key={tabDef.id}
                  type="button"
                  className={tab === tabDef.id ? "settings-nav__item is-active" : "settings-nav__item"}
                  onClick={() => void tryGoTab(tabDef.id)}
                  aria-current={tab === tabDef.id ? "page" : undefined}
                >
                  <tabDef.icon size={17} />
                  <span>{t(tabDef.labelKey)}</span>
                </button>
              ))}
            </nav>
          </aside>
          <main key={tab} className="settings-main fade-in-up">
            <div className="settings-page settings-page--centered">
              <VisualJobBanner onGoLibrary={() => void tryGoTab("library")} />
              {tab === "library" ? <CharacterLibrary onNewClick={() => void tryGoTab("create")} /> : null}
              {tab === "create" ? <CreateCharacter onDone={() => void tryGoTab("library")} /> : null}
              {tab === "memory" ? <MemoryPanel /> : null}
              {tab === "desktop" ? <DesktopBehaviorPanel /> : null}
              {tab === "key" ? <ApiKeyPanel /> : null}
              {tab === "language" ? <LanguagePanel /> : null}
            </div>
          </main>
        </div>
      </VisualJobProvider>
    </DirtyContext.Provider>
  );
}

// =============================================================
// 内联 SVG 图标（统一 currentColor 描边风格）
// =============================================================

interface IconProps {
  size?: number;
}

function LibraryIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 书架：4 本书 + 底板 */}
      <path d="M5 4v15" />
      <path d="M9 4v15" />
      <path d="M13 6v13" />
      <path d="M17 8l3 11" />
      <path d="M4 19h17" />
    </svg>
  );
}

function ForgeIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 火花 / 造物：一个加号 + 闪烁的小四星 */}
      <path d="M12 4v6" />
      <path d="M12 14v6" />
      <path d="M5 12h6" />
      <path d="M13 12h6" />
      <path d="M18.5 5.5l-1 1" />
      <path d="M6.5 18.5l-1 1" />
      <path d="M5.5 5.5l1 1" />
      <path d="M18.5 18.5l-1-1" />
    </svg>
  );
}

function MemoryIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 大脑 / 思绪：两个半圆 + 中线 */}
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 2v2a3 3 0 0 0 1 2v1a3 3 0 0 0 3 3" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 1 2v2a3 3 0 0 1-1 2v1a3 3 0 0 1-3 3" />
      <path d="M12 5v14" />
    </svg>
  );
}

function CompanionIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 11a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0z" />
      <path d="M9 8 7 5" />
      <path d="M15 8l2-3" />
      <path d="M9.5 13h.01" />
      <path d="M14.5 13h.01" />
      <path d="M11 16h2" />
      <path d="M5 18c-1.5-.5-2.5-1.5-2.5-3 0-1.2.8-2.2 2-2.5" />
      <path d="M19 18c1.5-.5 2.5-1.5 2.5-3 0-1.2-.8-2.2-2-2.5" />
    </svg>
  );
}

function KeyIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 钥匙：圆环 + 杆 + 两个齿 */}
      <circle cx="8.5" cy="12" r="3.5" />
      <path d="M12 12h9" />
      <path d="M17 12v3" />
      <path d="M20 12v2" />
    </svg>
  );
}

function LanguageIcon({ size = 18 }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
    </svg>
  );
}

