import { BrowserWindow } from "electron";
import { join } from "node:path";
import { PROACTIVE_BUBBLE_WINDOW_SIZE } from "../../shared/proactive-bubble-layout.js";

export function createProactiveBubbleWindow(devUrl: string | undefined): BrowserWindow {
  const { width, height } = PROACTIVE_BUBBLE_WINDOW_SIZE;

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
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
    void win.loadURL(`${devUrl}/proactive-bubble.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/proactive-bubble.html"));
  }

  return win;
}
