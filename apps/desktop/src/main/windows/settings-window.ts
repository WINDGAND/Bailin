import { BrowserWindow } from "electron";
import { join } from "node:path";

export function createSettingsWindow(devUrl: string | undefined): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    show: true,
    title: "百灵 Bailin · 设置",
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });
  if (devUrl) {
    void win.loadURL(`${devUrl}/settings.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/settings.html"));
  }
  return win;
}
