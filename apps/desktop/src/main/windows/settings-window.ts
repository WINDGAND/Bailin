import { BrowserWindow } from "electron";
import { join } from "node:path";
import { loadAppIcon } from "../app-icon.js";

export function createSettingsWindow(devUrl: string | undefined): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    // 关键：show: false + ready-to-show，避免 React 还没绘制时窗口先白闪一帧；
    // 这之前会在用户刚启动应用 / 拖动桌宠的瞬间叠加上一层白色面板抢焦点。
    show: false,
    backgroundColor: "#fbfaf7",
    title: "Bailin · 设置",
    icon: loadAppIcon(256),
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });
  if (devUrl) {
    void win.loadURL(`${devUrl}/settings.html`);
  } else {
    void win.loadFile(join(__dirname, "../../../renderer/settings.html"));
  }
  return win;
}
