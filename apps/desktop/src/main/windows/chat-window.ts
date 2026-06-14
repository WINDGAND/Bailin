import { BrowserWindow, screen, type BrowserWindow as BW } from "electron";
import { join } from "node:path";

export interface ChatWindowAnchor {
  petX: number;
  petY: number;
  petW: number;
  petH: number;
}

export function createChatWindow(devUrl: string | undefined): BW {
  const width = 380;
  const height = 480;
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  if (devUrl) {
    void win.loadURL(`${devUrl}/chat.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/chat.html"));
  }

  return win;
}

export function positionChatNear(win: BW, anchor: ChatWindowAnchor): void {
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching({
    x: anchor.petX,
    y: anchor.petY,
    width: anchor.petW,
    height: anchor.petH
  });
  const margin = 12;
  let x = anchor.petX - bounds.width - margin;
  if (x < display.workArea.x) {
    x = anchor.petX + anchor.petW + margin;
  }
  let y = anchor.petY - bounds.height / 2 + anchor.petH / 2;
  if (y < display.workArea.y + 8) y = display.workArea.y + 8;
  if (y + bounds.height > display.workArea.y + display.workArea.height - 8)
    y = display.workArea.y + display.workArea.height - bounds.height - 8;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: bounds.width, height: bounds.height });
}
