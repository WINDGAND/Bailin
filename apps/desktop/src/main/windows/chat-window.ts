import { BrowserWindow, screen, type BrowserWindow as BW } from "electron";
import { join } from "node:path";

/** 聊天窗默认内容区尺寸（与 createChatWindow 初始值一致）。 */
export const CHAT_WINDOW_DEFAULT_SIZE = { width: 380, height: 480 } as const;

/** 用户手动缩放的下限。 */
export const CHAT_WINDOW_MIN_SIZE = { width: 320, height: 360 } as const;

export interface ChatWindowSize {
  width: number;
  height: number;
}

export interface ChatWindowAnchor {
  petX: number;
  petY: number;
  petW: number;
  petH: number;
}

export function createChatWindow(devUrl: string | undefined): BW {
  const { width, height } = CHAT_WINDOW_DEFAULT_SIZE;
  const win = new BrowserWindow({
    width,
    height,
    minWidth: CHAT_WINDOW_MIN_SIZE.width,
    minHeight: CHAT_WINDOW_MIN_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
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
    void win.loadFile(join(__dirname, "../../../renderer/chat.html"));
  }

  return win;
}

/**
 * 读取当前内容区尺寸。仅在用户 resize 后调用；不要在跟随桌宠 reposition 的循环里读，
 * 否则 Windows 非整数 DPI 下 getBounds/getContentBounds 的宽高会随 setContentBounds 漂移。
 */
export function readChatContentSize(win: BW): ChatWindowSize {
  const content = win.getContentBounds();
  return {
    width: Math.max(CHAT_WINDOW_MIN_SIZE.width, content.width),
    height: Math.max(CHAT_WINDOW_MIN_SIZE.height, content.height)
  };
}

export function clampChatWindowSize(size: ChatWindowSize): ChatWindowSize {
  return {
    width: Math.max(CHAT_WINDOW_MIN_SIZE.width, Math.round(size.width)),
    height: Math.max(CHAT_WINDOW_MIN_SIZE.height, Math.round(size.height))
  };
}

/**
 * 把聊天窗定位到桌宠旁。只移动位置，尺寸由调用方传入的 `size` 决定，
 * 避免反复 getBounds → setBounds 导致窗口越拖越大（electron#27651）。
 */
export function positionChatNear(win: BW, anchor: ChatWindowAnchor, size: ChatWindowSize): void {
  const { width, height } = clampChatWindowSize(size);
  const display = screen.getDisplayMatching({
    x: anchor.petX,
    y: anchor.petY,
    width: anchor.petW,
    height: anchor.petH
  });
  const margin = 4;
  const work = display.workArea;
  const petCenterX = anchor.petX + anchor.petW / 2;
  const distToLeft = petCenterX - work.x;
  const distToRight = work.x + work.width - petCenterX;

  // 桌宠离哪侧更近，就把聊天窗放到另一侧，避免贴边溢出。
  let x =
    distToLeft <= distToRight
      ? anchor.petX + anchor.petW + margin
      : anchor.petX - width - margin;

  // 首选侧放不下时换到另一侧，最后再 clamp 到 workArea 内。
  if (x + width > work.x + work.width) {
    x = anchor.petX - width - margin;
  }
  if (x < work.x) {
    x = anchor.petX + anchor.petW + margin;
  }
  x = Math.max(work.x, Math.min(x, work.x + work.width - width));

  let y = anchor.petY - height / 2 + anchor.petH / 2;
  if (y < work.y + 8) y = work.y + 8;
  if (y + height > work.y + work.height - 8) {
    y = work.y + work.height - height - 8;
  }
  win.setContentBounds({ x: Math.round(x), y: Math.round(y), width, height });
}
