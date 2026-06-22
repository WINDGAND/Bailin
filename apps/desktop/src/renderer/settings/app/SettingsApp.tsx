import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBailin } from "../../shared/use-bailin.js";
import { useShortcut, useKeyboard } from "../../shared/keyboard.js";
import { BrandLogo } from "../../shared/brand-logo.js";
import { useConfirm } from "../../shared/feedback.js";
import { SetupWizard } from "../setup/SetupWizard.js";
import { CharacterLibrary } from "../library/CharacterLibrary.js";
import { CreateCharacter } from "../create/CreateCharacter.js";
import { MemoryPanel } from "../memory/MemoryPanel.js";
import { ApiKeyPanel } from "../provider/ApiKeyPanel.js";
import { DesktopBehaviorPanel } from "../desktop/DesktopBehaviorPanel.js";
import { GeneralSettingsPanel } from "../general/GeneralSettingsPanel.js";
import { DirtyContext, type DirtyContextValue } from "./dirty-context.js";
import { VisualJobProvider } from "./visual-job-context.js";
import { VisualJobBanner } from "./VisualJobBanner.js";
import { DistillationJobProvider } from "./distillation-job-context.js";
import { DistillationJobBanner } from "./DistillationJobBanner.js";
import { useI18n } from "../../shared/i18n/index.js";

type Tab = "library" | "create" | "memory" | "desktop" | "key" | "settings";

const SIDEBAR_COLLAPSED_KEY = "bailin.settingsSidebarCollapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

interface TabDef {
  id: Tab;
  labelKey: "nav.library" | "nav.create" | "nav.memory" | "nav.desktop" | "nav.key" | "nav.settings";
  icon: (props: { size?: number }) => JSX.Element;
}

const TABS: TabDef[] = [
  { id: "library", labelKey: "nav.library", icon: LibraryIcon },
  { id: "create", labelKey: "nav.create", icon: ForgeIcon },
  { id: "memory", labelKey: "nav.memory", icon: MemoryIcon },
  { id: "desktop", labelKey: "nav.desktop", icon: CompanionIcon },
  { id: "key", labelKey: "nav.key", icon: KeyIcon },
  { id: "settings", labelKey: "nav.settings", icon: SettingsIcon }
];

export function SettingsApp(): JSX.Element {
  const bailin = useBailin();
  const { t, ready: i18nReady } = useI18n();
  const kb = useKeyboard();
  const confirm = useConfirm();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const dirtyRef = useRef(false);

  useEffect(() => {
    void bailin.app.isFirstRun().then((v) => setFirstRun(v));
  }, [bailin]);

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

  const tryGoTabRef = useRef(tryGoTab);
  tryGoTabRef.current = tryGoTab;

  useEffect(() => {
    return bailin.on.navigateSettings((evt) => {
      if (evt.tab) void tryGoTabRef.current(evt.tab);
    });
  }, [bailin]);

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
    label: t("nav.settings"),
    handler: () => void tryGoTab("settings")
  });
  useShortcut({
    id: "help",
    combo: "?",
    scope: "Settings",
    label: t("keyboard.discoverHint"),
    handler: () => kb.openHelp()
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  if (firstRun === null || !i18nReady) {
    // 启动闪现的加载态：用 eyebrow + display + skeleton 行配色调，
    // 跟 panel 的视觉语言一致，避免「光秃秃一行字」的廉价感。
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={t("common.loading")}
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
          padding: 40,
          background: "var(--paper)"
        }}
      >
        <BrandLogo size={48} className="brand-logo brand-logo--hero" />
        <div className="eyebrow">Bailin · 0.0.1</div>
        <div className="display display--section" style={{ color: "var(--ink-faint)" }}>
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (firstRun) {
    return (
      <SetupWizard
        onDone={async () => {
          await bailin.app.completeFirstRun();
          setFirstRun(false);
        }}
      />
    );
  }

  return (
    <DirtyContext.Provider value={dirtyCtx}>
      <DistillationJobProvider>
        <VisualJobProvider>
          <div className="settings-shell">
            <aside
              className={`settings-sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
              aria-label={t("common.settingsSidebar")}
              aria-expanded={!sidebarCollapsed}
            >
              <div className="settings-sidebar__header">
                <div className="settings-brand">
                  <BrandLogo size={32} className="settings-brand__logo" alt="百灵 Bailin" />
                  <div className="settings-brand__copy" aria-hidden={sidebarCollapsed}>
                    <div className="eyebrow">Bailin · 0.0.1</div>
                    <div className="display display--section settings-brand__title">
                      百灵
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="settings-sidebar__toggle"
                  onClick={toggleSidebar}
                  aria-label={
                    sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")
                  }
                  title={sidebarCollapsed ? t("sidebar.expand") : t("sidebar.collapse")}
                >
                  <SidebarToggleIcon collapsed={sidebarCollapsed} />
                </button>
              </div>

              {/*
                设计选择 (S3 ARIA review):
                我们走 "page navigation" 模式而不是 "tablist" 模式 ——
                  - 每个 tab 切换近似独立 page（main 会 unmount/remount），不是页面内嵌的 tabpanel
                  - aria-current="page" 是 W3C 推荐的 navigation 模式标记
                  - 不接管 ArrowKeys：用户用 Tab 在按钮间移动，Cmd+1..6 数字键直达
                如未来想换成 tablist 模式，记得同时改 main 为 role="tabpanel" + aria-labelledby
                + 加 Arrow 键导航 + 取消 main 的 key={tab} 强制 remount。
              */}
              <nav className="settings-nav" aria-label={t("common.settingsNav")}>
                {TABS.map((tabDef) => (
                  <button
                    key={tabDef.id}
                    type="button"
                    className={tab === tabDef.id ? "settings-nav__item is-active" : "settings-nav__item"}
                    onClick={() => void tryGoTab(tabDef.id)}
                    aria-current={tab === tabDef.id ? "page" : undefined}
                    title={sidebarCollapsed ? t(tabDef.labelKey) : undefined}
                  >
                    <tabDef.icon size={17} />
                    <span>{t(tabDef.labelKey)}</span>
                  </button>
                ))}
              </nav>
            </aside>
            {/*
              设计选择 (S7 ARIA review):
              main 用 key={tab} 强制 unmount/remount。优点：state 自动重置，
              避免 stale state；缺点：未保存 draft 会丢失。后者已被 tryGoTab 的
              dirtyRef + confirm 模态拦截，因此 unmount 是可接受的取舍。
              如未来想保留 panel state（visibility 切换而非 unmount），
              需要每个 panel 显式处理 hidden 时的 lifecycle（取消订阅、暂停 polling 等）。
            */}
            <main key={tab} className="settings-main fade-in-up">
              <div className="settings-page settings-page--centered">
                {tab !== "create" ? (
                  <DistillationJobBanner
                    onViewProgress={() => void tryGoTab("create")}
                    onGoLibrary={() => void tryGoTab("library")}
                  />
                ) : null}
                <VisualJobBanner onGoLibrary={() => void tryGoTab("library")} />
                {tab === "library" ? <CharacterLibrary onNewClick={() => void tryGoTab("create")} /> : null}
                {tab === "create" ? <CreateCharacter onDone={() => void tryGoTab("library")} /> : null}
                {tab === "memory" ? <MemoryPanel /> : null}
                {tab === "desktop" ? <DesktopBehaviorPanel /> : null}
                {tab === "key" ? <ApiKeyPanel /> : null}
                {tab === "settings" ? <GeneralSettingsPanel /> : null}
              </div>
            </main>
          </div>
        </VisualJobProvider>
      </DistillationJobProvider>
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

function SettingsIcon({ size = 18 }: IconProps): JSX.Element {
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
      {/* 齿轮：外圈齿 + 中心孔，与侧栏其它描边图标一致 */}
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }): JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {collapsed ? (
        <>
          <path d="M9 6l6 6-6 6" />
          <path d="M4 6v12" />
        </>
      ) : (
        <>
          <path d="M15 6l-6 6 6 6" />
          <path d="M20 6v12" />
        </>
      )}
    </svg>
  );
}

