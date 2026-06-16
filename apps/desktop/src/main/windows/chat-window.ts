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
    hasShadow: false,
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
  const work = display.workArea;
  const petCenterX = anchor.petX + anchor.petW / 2;
  const distToLeft = petCenterX - work.x;
  const distToRight = work.x + work.width - petCenterX;

  // 桌宠离哪侧更近，就把聊天窗放到另一侧，避免贴边溢出。
  let x =
    distToLeft <= distToRight
      ? anchor.petX + anchor.petW + margin
      : anchor.petX - bounds.width - margin;

  // 首选侧放不下时换到另一侧，最后再 clamp 到 workArea 内。
  if (x + bounds.width > work.x + work.width) {
    x = anchor.petX - bounds.width - margin;
  }
  if (x < work.x) {
    x = anchor.petX + anchor.petW + margin;
  }
  x = Math.max(work.x, Math.min(x, work.x + work.width - bounds.width));

  let y = anchor.petY - bounds.height / 2 + anchor.petH / 2;
  if (y < work.y + 8) y = work.y + 8;
  if (y + bounds.height > work.y + work.height - 8) {
    y = work.y + work.height - bounds.height - 8;
  }
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: bounds.width, height: bounds.height });
}
