import { useEffect, useState } from "react";
import { useNuwa } from "../../shared/use-nuwa.js";
import { useShortcut, useKeyboard } from "../../shared/keyboard.js";
import { SetupWizard } from "../setup/SetupWizard.js";
import { CharacterLibrary } from "../library/CharacterLibrary.js";
import { CreateCharacter } from "../create/CreateCharacter.js";
import { MemoryPanel } from "../memory/MemoryPanel.js";
import { ApiKeyPanel } from "../provider/ApiKeyPanel.js";

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

export function SettingsApp(): JSX.Element {
  const nuwa = useNuwa();
  const kb = useKeyboard();
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("library");

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

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar" aria-label="设置侧边栏">
        <div className="settings-brand">
          <div className="eyebrow">Bailin · 0.0.1</div>
          <div className="display display--section" style={{ marginTop: 4 }}>
            百灵
          </div>
        </div>

        <nav className="settings-nav" aria-label="设置导航">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "settings-nav__item is-active" : "settings-nav__item"}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon size={17} />
              <span>{t.label}</span>
              <span className="kbd">{t.combo}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main key={tab} className="settings-main fade-in-up">
        <div className="settings-page">
          {tab === "library" ? <CharacterLibrary onNewClick={() => setTab("create")} /> : null}
          {tab === "create" ? <CreateCharacter onDone={() => setTab("library")} /> : null}
          {tab === "memory" ? <MemoryPanel /> : null}
          {tab === "key" ? <ApiKeyPanel /> : null}
        </div>
      </main>
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

