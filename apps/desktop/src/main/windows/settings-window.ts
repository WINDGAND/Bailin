import { BrowserWindow } from "electron";
import { join } from "node:path";
import { loadAppIcon } from "../app-icon.js";
import {
  applySettingsWindowChrome,
  resolveChromeTheme,
  settingsChromeTokens
} from "./title-bar-chrome.js";

/**
 * 设置窗工厂：供应商、角色库、蒸馏进度等主配置界面。
 * 与桌宠/聊天窗不同，这里保留 Windows 原生最小化/最大化/关闭（titleBarOverlay），
 * 但隐藏系统「图标 + 标题」灰条，顶栏色与 design-system paper 对齐。
 */

/**
 * 创建尚未显示的设置窗，并加载 `settings.html`。
 *
 * @param devUrl Vite 开发服 origin；缺省时加载打包后的 renderer 文件。
 * @param themePreference 当前主题偏好（light/dark/system）；未传则按系统解析 chrome 色。
 * @returns 未 `show` 的 `BrowserWindow`，调用方应等 `ready-to-show` 再显示，避免白闪。
 * 副作用：写入 hidden titleBar + overlay chrome；按主题上色背景与按钮符号。
 */
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
