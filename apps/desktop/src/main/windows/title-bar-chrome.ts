import { BrowserWindow, nativeTheme } from "electron";

export type ChromeTheme = "light" | "dark";

export interface SettingsChromeTokens {
  backgroundColor: string;
  overlay: {
    color: string;
    symbolColor: string;
    height: number;
  };
}

/** 与 design-system 浅/深 paper + ink 对齐，避免顶栏再露出系统灰条。 */
export function settingsChromeTokens(theme: ChromeTheme): SettingsChromeTokens {
  if (theme === "dark") {
    return {
      backgroundColor: "#2b262a",
      overlay: {
        color: "#2b262a",
        symbolColor: "#f4f0eb",
        height: 36
      }
    };
  }
  return {
    backgroundColor: "#fbfaf7",
    overlay: {
      color: "#fbfaf7",
      symbolColor: "#172626",
      height: 36
    }
  };
}

export function resolveChromeTheme(preference: string | null | undefined): ChromeTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function applySettingsWindowChrome(win: BrowserWindow, theme: ChromeTheme): void {
  if (win.isDestroyed()) return;
  const chrome = settingsChromeTokens(theme);
  win.setBackgroundColor(chrome.backgroundColor);
  try {
    win.setTitleBarOverlay(chrome.overlay);
  } catch {
    /* 旧系统 / 不支持 overlay 时静默跳过，仍保留 hidden title bar */
  }
}
