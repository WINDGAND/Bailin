import { BrowserWindow } from "electron";
import { join } from "node:path";
import { PET_MENU_PANEL_WIDTH, PET_MENU_WINDOW_HEIGHT } from "./pet-window.js";

/** 桌宠右键快捷菜单：独立透明窗，绝不改动桌宠窗 bounds。 */
export function createPetMenuWindow(devUrl: string | undefined): BrowserWindow {
  const win = new BrowserWindow({
    width: PET_MENU_PANEL_WIDTH,
    height: PET_MENU_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(false);

  if (devUrl) {
    void win.loadURL(`${devUrl}/pet-menu.html`);
  } else {
    void win.loadFile(join(__dirname, "../../../renderer/pet-menu.html"));
  }

  return win;
}
