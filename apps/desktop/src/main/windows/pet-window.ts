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

export type PetMenuSide = "left" | "right" | "above" | "below";
/** @deprecated 旧扩窗布局仅支持左右。 */
export type PetMenuHorizontalSide = "left" | "right";

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

/**
 * 桌宠窗内精灵「核心区」：四周内缩 tuck（透明留白预算）。
 * 菜单可叠进留白，但不得与核心区重叠（否则盖住像素本体）。
 */
export function petCoreRect(
  petX: number,
  petY: number,
  petW: number,
  petH: number,
  tuck: number = PET_MENU_TUCK
): ScreenRect {
  const maxInset = Math.max(0, Math.min(tuck, Math.floor(petW / 2) - 1, Math.floor(petH / 2) - 1));
  return {
    x: petX + maxInset,
    y: petY + maxInset,
    width: Math.max(1, petW - 2 * maxInset),
    height: Math.max(1, petH - 2 * maxInset)
  };
}

function clampMenuX(
  x: number,
  menuW: number,
  workArea: { x: number; y: number; width: number; height: number }
): number {
  const workRight = workArea.x + workArea.width;
  return Math.max(workArea.x, Math.min(x, workRight - menuW));
}

function clampMenuY(
  y: number,
  menuH: number,
  workArea: { x: number; y: number; width: number; height: number },
  margin: number = 8
): number {
  const workBottom = workArea.y + workArea.height;
  let next = y;
  if (next + menuH > workBottom - margin) {
    next = workBottom - menuH - margin;
  }
  if (next < workArea.y + margin) next = workArea.y + margin;
  return next;
}

function horizontalGap(a: ScreenRect, b: ScreenRect): number {
  if (a.x + a.width <= b.x) return b.x - (a.x + a.width);
  if (b.x + b.width <= a.x) return a.x - (b.x + b.width);
  return 0;
}

/**
 * 菜单须锚在桌宠附近。
 * - 左右：与桌宠窗水平间距 ≤ gap（允许 tuck 重叠）；被推到对话外侧则判失败。
 * - 上下：菜单中心落在桌宠水平范围内（避开对话时垂直间距可变大）。
 */
export function menuAnchoredNearPet(
  menu: ScreenRect,
  pet: ScreenRect,
  side: PetMenuSide
): boolean {
  if (side === "left" || side === "right") {
    return horizontalGap(pet, menu) <= PET_MENU_GAP;
  }
  const menuCx = menu.x + menu.width / 2;
  return menuCx >= pet.x && menuCx <= pet.x + pet.width;
}

/** 菜单 bounds 是否避开精灵核心、聊天，且落在 workArea 内。 */
export function petMenuPlacementViable(
  menu: ScreenRect,
  petCore: ScreenRect,
  chat: ScreenRect | null,
  workArea: { x: number; y: number; width: number; height: number },
  petWindow?: ScreenRect,
  side?: PetMenuSide
): boolean {
  const workRight = workArea.x + workArea.width;
  const workBottom = workArea.y + workArea.height;
  if (menu.x < workArea.x || menu.y < workArea.y) return false;
  if (menu.x + menu.width > workRight || menu.y + menu.height > workBottom) return false;
  if (rectsOverlap(menu, petCore, PET_MENU_GAP)) return false;
  if (chat && rectsOverlap(menu, chat, PET_MENU_GAP)) return false;
  if (petWindow && side && !menuAnchoredNearPet(menu, petWindow, side)) return false;
  return true;
}

/**
 * 根据聊天窗位置与屏幕可用空间决定菜单锚点方向。
 * 优先左右（有聊天时先对侧）；左右都不可行时回退上下，绝不强制夹到盖住精灵。
 */
export function resolvePetMenuSide(input: PetMenuPlacementInput): PetMenuSide {
  const { petX, petY, petW, petH, chat, workArea } = input;
  const menuSize = {
    width: PET_MENU_PANEL_WIDTH,
    height: PET_MENU_WINDOW_HEIGHT
  };
  const core = petCoreRect(petX, petY, petW, petH);

  const petWindow: ScreenRect = { x: petX, y: petY, width: petW, height: petH };

  const trySide = (side: PetMenuSide): boolean => {
    const bounds = computePetMenuPopupBounds(
      petX,
      petY,
      petW,
      petH,
      side,
      workArea,
      menuSize,
      chat
    );
    return petMenuPlacementViable(bounds, core, chat, workArea, petWindow, side);
  };

  let horizontalOrder: PetMenuSide[];
  if (chat) {
    const chatOnRight = chat.x + chat.width / 2 >= petX + petW / 2;
    horizontalOrder = chatOnRight ? ["left", "right"] : ["right", "left"];
  } else {
    horizontalOrder = ["right", "left"];
  }

  for (const side of horizontalOrder) {
    if (trySide(side)) return side;
  }

  const spaceAbove = petY - workArea.y;
  const spaceBelow = workArea.y + workArea.height - (petY + petH);
  const verticalOrder: PetMenuSide[] =
    spaceAbove >= spaceBelow ? ["above", "below"] : ["below", "above"];

  for (const side of verticalOrder) {
    if (trySide(side)) return side;
  }

  // 极端空间：仍选上下中空间更大的一侧，避免强制左右 + clamp 盖精灵。
  return verticalOrder[0]!;
}

/**
 * 独立菜单窗的屏幕 bounds。
 * 不修改桌宠窗几何：桌宠屏幕位置恒定；左右可 tuck 进透明留白，上下用正 gap。
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
  const core = petCoreRect(petX, petY, petW, petH);

  let x: number;
  let y: number;

  if (side === "above" || side === "below") {
    x = petX + petW / 2 - menuSize.width / 2;
    x = clampMenuX(x, menuSize.width, workArea);
    y =
      side === "above"
        ? petY - menuSize.height - gap
        : petY + petH + gap;

    let candidate: ScreenRect = {
      x,
      y,
      width: menuSize.width,
      height: menuSize.height
    };
    if (chat && rectsOverlap(candidate, chat, gap)) {
      if (side === "above") {
        y = Math.min(y, chat.y - menuSize.height - gap);
      } else {
        y = Math.max(y, chat.y + chat.height + gap);
      }
      candidate = { ...candidate, y };
      if (rectsOverlap(candidate, chat, gap)) {
        const chatCenter = chat.x + chat.width / 2;
        const petCenter = petX + petW / 2;
        x =
          petCenter <= chatCenter
            ? chat.x - menuSize.width - gap
            : chat.x + chat.width + gap;
        x = clampMenuX(x, menuSize.width, workArea);
      }
    }

    y = clampMenuY(y, menuSize.height, workArea);
  } else {
    const inset = petMenuEdgeInset();
    x =
      side === "right"
        ? petX + petW + inset
        : petX - menuSize.width - inset;
    x = clampMenuX(x, menuSize.width, workArea);
    y = clampMenuY(petY, menuSize.height, workArea);

    let candidate: ScreenRect = {
      x,
      y,
      width: menuSize.width,
      height: menuSize.height
    };

    // clamp 后若盖住精灵核心：撤销 tuck，改用正 gap 再算一次。
    if (rectsOverlap(candidate, core, gap)) {
      x =
        side === "right"
          ? petX + petW + gap
          : petX - menuSize.width - gap;
      x = clampMenuX(x, menuSize.width, workArea);
      candidate = { ...candidate, x };
    }

    if (chat && rectsOverlap(candidate, chat, gap)) {
      if (side === "left") {
        x = Math.min(x, chat.x - menuSize.width - gap);
      } else {
        x = Math.max(x, chat.x + chat.width + gap);
      }
      x = clampMenuX(x, menuSize.width, workArea);
    }
  }

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
  side: PetMenuHorizontalSide,
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
