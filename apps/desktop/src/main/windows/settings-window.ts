import { BrowserWindow } from "electron";
import { join } from "node:path";
import { loadAppIcon } from "../app-icon.js";
import {
  applySettingsWindowChrome,
  resolveChromeTheme,
  settingsChromeTokens
} from "./title-bar-chrome.js";

export function createSettingsWindow(
  devUrl: string | undefined,
  themePreference?: string | null
): BrowserWindow {
  const theme = resolveChromeTheme(themePreference);
  const chrome = settingsChromeTokens(theme);

  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    // 关闭：show: false + ready-to-show，避免 React 还没绘制时窗口先白闪一帧；
    // 这之前会在用户刚启动应用 / 拖动桌宠的瞬间叠加上一层白色面板抢焦点。
    show: false,
    backgroundColor: chrome.backgroundColor,
    // 隐藏系统「图标 + 标题」灰条；保留 Windows 原生最小化/最大化/关闭（titleBarOverlay）。
    titleBarStyle: "hidden",
    titleBarOverlay: chrome.overlay,
    title: "Bailin",
    icon: loadAppIcon(256),
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  applySettingsWindowChrome(win, theme);

  if (devUrl) {
    void win.loadURL(`${devUrl}/settings.html`);
  } else {
    void win.loadFile(join(__dirname, "../../../renderer/settings.html"));
  }
  return win;
}
