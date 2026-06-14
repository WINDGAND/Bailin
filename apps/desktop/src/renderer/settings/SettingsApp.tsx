import { useCallback, useEffect, useState } from "react";
import { useNuwa } from "../shared/use-nuwa.js";
import { useShortcut, useKeyboard } from "../shared/keyboard.js";
import { SetupWizard } from "./SetupWizard.js";
import { CharacterLibrary } from "./CharacterLibrary.js";
import { CreateCharacter } from "./CreateCharacter.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { ApiKeyPanel } from "./ApiKeyPanel.js";

type Tab = "library" | "create" | "memory" | "key";

interface TabDef {
  id: Tab;
  label: string;
  combo: string;
  icon: (props: { size?: number }) => JSX.Element;
}

const TABS: TabDef[] = [
  { id: "library", label: "角色仓库", combo: "1", icon: LibraryIcon },
  { id: "create", label: "造一个角色", combo: "2", icon: ForgeIcon },
  { id: "memory", label: "记忆 / 用户画像", combo: "3", icon: MemoryIcon },
  { id: "key", label: "模型与 API Key", combo: "4", icon: KeyIcon }
];

const SIDEBAR_COLLAPSED_KEY = "nuwa.settings.sidebarCollapsed";

export function SettingsApp(): JSX.Element {
  const nuwa = useNuwa();
  const kb = useKeyboard();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        sessionStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void nuwa.app.isFirstRun().then((v) => setFirstRun(v));
  }, [nuwa]);

  // 注册 1234 切 tab
  useShortcut({
    id: "tab-1",
    combo: "1",
    scope: "Settings",
    label: "切到 角色仓库",
    handler: () => setTab("library")
  });
  useShortcut({
    id: "tab-2",
    combo: "2",
    scope: "Settings",
    label: "切到 造一个角色",
    handler: () => setTab("create")
  });
  useShortcut({
    id: "tab-3",
    combo: "3",
    scope: "Settings",
    label: "切到 记忆 / 用户画像",
    handler: () => setTab("memory")
  });
  useShortcut({
    id: "tab-4",
    combo: "4",
    scope: "Settings",
    label: "切到 模型与 API Key",
    handler: () => setTab("key")
  });
  useShortcut({
    id: "sidebar-toggle",
    combo: "Mod+b",
    scope: "Settings",
    label: "展开 / 折叠侧边栏",
    handler: toggleCollapsed
  });
  useShortcut({
    id: "help",
    combo: "?",
    scope: "Settings",
    label: "查看快捷键",
    handler: () => kb.openHelp()
  });

  if (firstRun === null) {
    return (
      <div style={{ padding: 40 }}>
        <div className="display display--page">加载中…</div>
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

  const sidebarWidth = collapsed ? 72 : 240;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${sidebarWidth}px 1fr`,
        minHeight: "100vh",
        transition: "grid-template-columns var(--motion-base) var(--ease-out)"
      }}
    >
      <aside
        className="sidebar"
        data-collapsed={collapsed ? "1" : "0"}
        aria-label="设置侧边栏"
        style={{
          borderRight: "1px solid var(--grid-strong)",
          padding: collapsed ? "16px 12px" : "20px 18px",
          background: "var(--paper)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          position: "relative",
          transition:
            "padding var(--motion-base) var(--ease-out)"
        }}
      >
        {/* 顶部：标题 + 折叠按钮 */}
        <div
          className="row row--between"
          style={{ minHeight: 32, gap: 6, alignItems: "flex-start" }}
        >
          {collapsed ? (
            // 折叠态：只显示小 logo
            <div
              aria-label="百灵 Bailin"
              title="百灵 Bailin · 0.0.1"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid var(--grid-strong)",
                background: "var(--paper-deep)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--magenta)",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 16
              }}
            >
              百
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>
                百灵 Bailin · 0.0.1
              </div>
              <div
                className="display display--section"
                style={{ marginTop: 2, fontSize: 20, lineHeight: 1.15 }}
              >
                桌面人格容器
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            data-hint={collapsed ? "展开 · Ctrl+B" : "折叠 · Ctrl+B"}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: 999,
              border: "1px solid var(--grid-strong)",
              background: "var(--paper-deep)",
              color: "var(--ink-soft)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition:
                "background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--paper)";
              e.currentTarget.style.color = "var(--ink)";
              e.currentTarget.style.borderColor = "var(--ink)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--paper-deep)";
              e.currentTarget.style.color = "var(--ink-soft)";
              e.currentTarget.style.borderColor = "var(--grid-strong)";
            }}
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>

        {/* 导航 */}
        <nav
          aria-label="设置导航"
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}
        >
          {TABS.map((t) => (
            <SidebarPill
              key={t.id}
              tab={t}
              active={tab === t.id}
              collapsed={collapsed}
              onClick={() => setTab(t.id)}
            />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* 底部提示卡：折叠时隐藏 */}
        {collapsed ? (
          <div
            aria-hidden="true"
            data-hint="按 ? 查看本页快捷键"
            style={{
              width: 36,
              height: 36,
              alignSelf: "center",
              borderRadius: 999,
              border: "1px dashed var(--grid-strong)",
              color: "var(--ink-faint)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 14
            }}
          >
            ?
          </div>
        ) : (
          <div
            className="body-sm"
            style={{
              padding: 12,
              borderRadius: 12,
              background: "var(--paper-deep)",
              border: "1px solid var(--grid)",
              lineHeight: 1.55
            }}
          >
            <div style={{ marginBottom: 4 }}>
              所有数据存在本机；API Key 用 DPAPI 加密。
            </div>
            <div>
              按 <span className="kbd">Ctrl</span>
              <span style={{ margin: "0 2px" }}>+</span>
              <span className="kbd">Shift</span>
              <span style={{ margin: "0 2px" }}>+</span>
              <span className="kbd">P</span> 在任意位置唤起当前角色；
              按 <span className="kbd">?</span> 查看本页快捷键。
            </div>
          </div>
        )}
      </aside>
      <main
        key={tab}
        className="fade-in-up"
        style={{
          padding: "36px clamp(24px, 4vw, 60px)",
          background: "var(--paper-deep)",
          overflow: "auto"
        }}
      >
        {tab === "library" ? <CharacterLibrary onNewClick={() => setTab("create")} /> : null}
        {tab === "create" ? <CreateCharacter onDone={() => setTab("library")} /> : null}
        {tab === "memory" ? <MemoryPanel /> : null}
        {tab === "key" ? <ApiKeyPanel /> : null}
      </main>
    </div>
  );
}

// =============================================================
// SidebarPill：椭圆胶囊按钮 + 折叠态右侧 tooltip
// =============================================================

interface SidebarPillProps {
  tab: TabDef;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

function SidebarPill({ tab, active, collapsed, onClick }: SidebarPillProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const Icon = tab.icon;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? tab.label : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
          padding: collapsed ? "10px 0" : "9px 14px",
          borderRadius: 999,
          border: `1px solid ${active ? "var(--ink)" : hovered ? "var(--ink-soft)" : "var(--grid-strong)"}`,
          background: active ? "var(--paper-deep)" : "transparent",
          color: active ? "var(--ink)" : hovered ? "var(--ink)" : "var(--ink-soft)",
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          fontWeight: active ? 500 : 400,
          cursor: "pointer",
          width: "100%",
          transition:
            "background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)"
        }}
      >
        <Icon size={18} />
        {collapsed ? null : (
          <>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {tab.label}
            </span>
            <span className="kbd" aria-hidden="true">
              {tab.combo}
            </span>
          </>
        )}
      </button>
      {/* 折叠态：右侧 tooltip（不被 sidebar 裁切） */}
      {collapsed && hovered ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: "50%",
            transform: "translateY(-50%)",
            padding: "5px 10px",
            background: "var(--ink)",
            color: "var(--paper)",
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 50,
            boxShadow: "var(--shadow-soft)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <span>{tab.label}</span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              padding: "1px 5px",
              border: "1px solid rgba(245,239,226,0.3)",
              borderRadius: 3,
              opacity: 0.75
            }}
          >
            {tab.combo}
          </span>
        </div>
      ) : null}
    </div>
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

function CollapseIcon({ collapsed }: { collapsed: boolean }): JSX.Element {
  // 一个统一的折叠图标：左侧竖线 + 一个三角箭头，根据 collapsed 翻转方向
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
      style={{
        transform: collapsed ? "scaleX(-1)" : "scaleX(1)",
        transition: "transform var(--motion-base) var(--ease-out)"
      }}
    >
      <path d="M4 5v14" />
      <path d="M9 12h11" />
      <path d="M14 7l-5 5 5 5" />
    </svg>
  );
}
