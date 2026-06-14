import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

export function createPetWindow(devUrl: string | undefined): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  // 容下 96×96 @2x = 192px sprite + 12px padding + drop shadow 缓冲
  const width = 220;
  const height = 240;

  const win = new BrowserWindow({
    width,
    height,
    x: work.x + work.width - width - 24,
    y: work.y + work.height - height - 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  // 默认接收鼠标事件；渲染层在 mount 后会按区域切换 setIgnoreMouseEvents。
  win.setIgnoreMouseEvents(false);

  if (devUrl) {
    void win.loadURL(`${devUrl}/pet.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/pet.html"));
  }

  return win;
}
