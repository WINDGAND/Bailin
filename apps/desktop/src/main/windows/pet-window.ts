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

/** 独立快捷菜单窗内容宽度（与 `.pet-menu-panel` max-width 对齐）。 */
export const PET_MENU_PANEL_WIDTH = 196;
/** 菜单窗默认高度（内部可滚动；子菜单展开不改窗宽）。 */
export const PET_MENU_WINDOW_HEIGHT = 320;
/**
 * 菜单与桌宠窗缘的「空气」间距。桌宠窗四周有大块透明留白，
 * 再配合 {@link PET_MENU_TUCK} 伸入留白，视觉上贴近精灵而不贴窗缘太远。
 */
export const PET_MENU_GAP = 4;
/**
 * 菜单可伸入桌宠窗透明留白的像素（相对窗缘）。
 * 旧同窗菜单曾用 -56px margin；独立窗用 tuck 达到相近贴身感。
 */
export const PET_MENU_TUCK = 40;

/** @deprecated 使用 {@link PET_MENU_PANEL_WIDTH}；保留别名以免外部引用断裂。 */
export const PET_MENU_EXTRA_WIDTH = PET_MENU_PANEL_WIDTH;

export type PetMenuSide = "left" | "right";

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect, gap: number): boolean {
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

/** 外侧间距减去伸入留白；可为负，表示叠进桌宠窗透明区。 */
export function petMenuEdgeInset(
  gap: number = PET_MENU_GAP,
  tuck: number = PET_MENU_TUCK
): number {
  return gap - tuck;
}

function menuCandidateRect(
  petX: number,
  petY: number,
  petW: number,
  petH: number,
  side: PetMenuSide,
  menuW: number = PET_MENU_PANEL_WIDTH,
  inset: number = petMenuEdgeInset()
): ScreenRect {
  return side === "right"
    ? { x: petX + petW + inset, y: petY, width: menuW, height: petH }
    : { x: petX - menuW - inset, y: petY, width: menuW, height: petH };
}

/** 根据聊天窗位置与屏幕可用空间，决定菜单出现在桌宠左侧还是右侧。 */
export function resolvePetMenuSide(input: PetMenuPlacementInput): PetMenuSide {
  const { petX, petY, petW, petH, chat, workArea } = input;
  const menuW = PET_MENU_PANEL_WIDTH;
  const inset = petMenuEdgeInset();
  const workRight = workArea.x + workArea.width;

  const rightMenu = menuCandidateRect(petX, petY, petW, petH, "right", menuW, inset);
  const leftMenu = menuCandidateRect(petX, petY, petW, petH, "left", menuW, inset);

  const canPlaceRight = rightMenu.x + rightMenu.width <= workRight;
  const canPlaceLeft = leftMenu.x >= workArea.x;

  const rightOverlapsChat = chat ? rectsOverlap(rightMenu, chat, PET_MENU_GAP) : false;
  const leftOverlapsChat = chat ? rectsOverlap(leftMenu, chat, PET_MENU_GAP) : false;

  if (chat) {
    const chatCenter = chat.x + chat.width / 2;
    const petCenter = petX + petW / 2;
    const chatOnRight = chatCenter >= petCenter;

    if (chatOnRight) {
      if (canPlaceLeft && !leftOverlapsChat) return "left";
      if (canPlaceRight && !rightOverlapsChat) return "right";
      return "left";
    }
    if (canPlaceRight && !rightOverlapsChat) return "right";
    if (canPlaceLeft && !leftOverlapsChat) return "left";
    return "right";
  }

  if (canPlaceRight) return "right";
  if (canPlaceLeft) return "left";
  return "right";
}

/**
 * 独立菜单窗的屏幕 bounds。
 * 不修改桌宠窗几何：桌宠屏幕位置恒定，菜单开在其左/右侧并与桌宠、聊天保持 gap。
 */
export function computePetMenuPopupBounds(
  petX: number,
  petY: number,
  petW: number,
  petH: number,
  side: PetMenuSide,
  workArea: { x: number; y: number; width: number; height: number },
  menuSize: { width: number; height: number } = {
    width: PET_MENU_PANEL_WIDTH,
    height: PET_MENU_WINDOW_HEIGHT
  },
  chat: ScreenRect | null = null
): ScreenRect {
  const gap = PET_MENU_GAP;
  const inset = petMenuEdgeInset();
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;

  // inset 可为负：菜单伸入桌宠窗透明留白，视觉上更贴精灵。
  let x =
    side === "right" ? petX + petW + inset : petX - menuSize.width - inset;

  if (x < workArea.x) x = workArea.x;
  if (x + menuSize.width > workRight) x = workRight - menuSize.width;

  // 与聊天重叠时沿外侧让开（不撤销对桌宠留白的 tuck）。
  if (chat && rectsOverlap({ x, y: petY, width: menuSize.width, height: menuSize.height }, chat, gap)) {
    if (side === "left") {
      x = Math.min(x, chat.x - menuSize.width - gap);
    } else {
      x = Math.max(x, chat.x + chat.width + gap);
    }
    x = Math.max(workArea.x, Math.min(x, workRight - menuSize.width));
  }

  let y = petY;
  if (y + menuSize.height > workBottom - 8) {
    y = workBottom - menuSize.height - 8;
  }
  if (y < workArea.y + 8) y = workArea.y + 8;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(menuSize.width),
    height: Math.round(menuSize.height)
  };
}

/**
 * @deprecated 旧版「扩宽桌宠窗」布局；快捷菜单已改为独立窗 {@link computePetMenuPopupBounds}。
 * 保留供回归对照：左侧展开时右缘应等于 petX+baseW（未夹紧时）。
 */
export function computePetMenuWindowBounds(
  petX: number,
  petY: number,
  side: PetMenuSide,
  workArea: { x: number; y: number; width: number; height: number },
  petSize: { width: number; height: number } = PET_WINDOW_BASE_SIZE
): { x: number; y: number; width: number; height: number } {
  const baseW = petSize.width;
  const baseH = petSize.height;
  const menuW = PET_MENU_PANEL_WIDTH;
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

/** 桌宠在打开独立菜单前后屏幕矩形应保持不变（用于验证）。 */
export function petScreenRectUnchanged(
  before: ScreenRect,
  after: ScreenRect
): boolean {
  return (
    before.x === after.x &&
    before.y === after.y &&
    before.width === after.width &&
    before.height === after.height
  );
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
