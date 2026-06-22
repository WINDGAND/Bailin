import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import { PET_WINDOW_BASE_SIZE } from "../../shared/pet-display-scale.js";

/**
 * 桌宠窗口的"内容尺寸"基准（scale = 1.0）。
 * 实际尺寸见 {@link getPetWindowSize} / 用户设置 `petDisplayScale`。
 *
 * 为什么固定基准：Electron 在 Windows 非整数 DPI（125% / 150% / 175% 等）上
 * 存在已知 bug —— 反复 setPosition / setBounds 会让 getBounds() 返回的
 * width/height 微量增大（DIP↔物理像素舍入累积，electron #27651）。
 * 拖动桌宠每帧都用 getBounds() 实时读尺寸去 clamp，结果 maxX/maxY 越缩越小，
 * 表现就是用户看到的"活动范围越用越小，最后只能在一条线上拖"。
 *
 * 固化成常量后，clamp 永远用同一组宽高，不再被运行时的尺寸漂移污染；
 * 同时所有调用都改用 setContentBounds（不受同 bug 影响），双重保险。
 */
export const PET_WINDOW_SIZE = PET_WINDOW_BASE_SIZE;
/** 右键菜单展开时临时加宽，给菜单留出桌宠旁侧空间。 */
export const PET_MENU_EXTRA_WIDTH = 196;
/** 菜单与聊天窗之间的最小间距（屏幕坐标）。 */
export const PET_MENU_GAP = 4;

export type PetMenuSide = "left" | "right";

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: ScreenRect, b: ScreenRect, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

export interface PetMenuPlacementInput {
  petX: number;
  petY: number;
  petW: number;
  petH: number;
  chat: ScreenRect | null;
  workArea: { x: number; y: number; width: number; height: number };
}

/** 根据聊天窗位置与屏幕可用空间，决定菜单出现在桌宠左侧还是右侧。 */
export function resolvePetMenuSide(input: PetMenuPlacementInput): PetMenuSide {
  const { petX, petY, petW, petH, chat, workArea } = input;
  const menuW = PET_MENU_EXTRA_WIDTH;
  const workRight = workArea.x + workArea.width;

  const rightMenu: ScreenRect = { x: petX + petW, y: petY, width: menuW, height: petH };
  const leftMenu: ScreenRect = { x: petX - menuW, y: petY, width: menuW, height: petH };

  const canExpandRight = petX + petW + menuW <= workRight;
  const canExpandLeft = petX - menuW >= workArea.x;

  const rightOverlapsChat = chat ? rectsOverlap(rightMenu, chat, PET_MENU_GAP) : false;
  const leftOverlapsChat = chat ? rectsOverlap(leftMenu, chat, PET_MENU_GAP) : false;

  if (chat) {
    const chatCenter = chat.x + chat.width / 2;
    const petCenter = petX + petW / 2;
    const chatOnRight = chatCenter >= petCenter;

    if (chatOnRight) {
      if (canExpandLeft && !leftOverlapsChat) return "left";
      if (canExpandRight && !rightOverlapsChat) return "right";
      return "left";
    }
    if (canExpandRight && !rightOverlapsChat) return "right";
    if (canExpandLeft && !leftOverlapsChat) return "left";
    return "right";
  }

  if (canExpandRight) return "right";
  if (canExpandLeft) return "left";
  return "right";
}

export function computePetMenuWindowBounds(
  petX: number,
  petY: number,
  side: PetMenuSide,
  workArea: { x: number; y: number; width: number; height: number },
  petSize: { width: number; height: number } = PET_WINDOW_BASE_SIZE
): { x: number; y: number; width: number; height: number } {
  const baseW = petSize.width;
  const baseH = petSize.height;
  const menuW = PET_MENU_EXTRA_WIDTH;
  const expandedW = baseW + menuW;
  const workRight = workArea.x + workArea.width;

  if (side === "right") {
    let nextX = petX;
    if (nextX + expandedW > workRight) {
      nextX = workRight - expandedW;
    }
    return { x: nextX, y: petY, width: expandedW, height: baseH };
  }

  let nextX = petX - menuW;
  if (nextX < workArea.x) {
    nextX = workArea.x;
  }
  return { x: nextX, y: petY, width: expandedW, height: baseH };
}

export function createPetWindow(
  devUrl: string | undefined,
  initialSize: { width: number; height: number } = PET_WINDOW_BASE_SIZE
): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const { width, height } = initialSize;

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
    void win.loadFile(join(__dirname, "../../../renderer/pet.html"));
  }

  return win;
}
