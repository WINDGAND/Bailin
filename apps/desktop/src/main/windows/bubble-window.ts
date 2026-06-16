import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

export type BubbleDirection = "TL" | "TR" | "BL" | "BR" | "L" | "R";

export interface BubbleWindowSize {
  width: number;
  height: number;
}

/**
 * 气泡窗口的画布尺寸：除了气泡本身（300×280），还要给尾巴 + drop-shadow
 * 留出 padding，否则尾巴会被透明窗口的边界裁掉。
 */
export const BUBBLE_WINDOW_SIZE: BubbleWindowSize = {
  width: 400,
  height: 280
};

/** 渲染层与主进程都依赖的几何参数。
 *
 * v2 改造（一句话/两段话气泡）：
 * - 气泡宽度从 300 → 340，垂直方向更扁，整体形状偏「卡片便签」而不是「书页」。
 * - 高度上限 220px（够装 header + 约 3 行正文 + 输入框）；任何更长的回复都走 SegmentBuffer 分段轮播。
 */
export const BUBBLE_LAYOUT = {
  /** 气泡矩形相对气泡窗口左上角的内边距。 */
  outerPadding: 18,
  bubbleWidth: 340,
  bubbleHeight: 220,
  /** 尾巴垂直向外伸出的长度。 */
  tailLength: 12,
  /** 尾巴在水平方向上离气泡角的偏移（决定尾巴指向哪一侧）。 */
  tailEdgeOffset: 30,
  /** 桌宠和气泡之间的额外屏幕间距，避免尾巴贴脸。 */
  petGap: 6
} as const;

export function createBubbleWindow(devUrl: string | undefined): BrowserWindow {
  const win = new BrowserWindow({
    width: BUBBLE_WINDOW_SIZE.width,
    height: BUBBLE_WINDOW_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../../../preload/preload/index.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  if (devUrl) {
    void win.loadURL(`${devUrl}/bubble.html`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/bubble.html"));
  }

  return win;
}

export interface PetAnchor {
  /** 桌宠 sprite 中心 X（屏幕坐标）。 */
  centerX: number;
  /** 桌宠 sprite 顶部 Y（屏幕坐标，sprite 的"头顶"）。 */
  topY: number;
  bottomY: number;
  centerY: number;
  leftX: number;
  rightX: number;
}

/**
 * 根据桌宠在屏幕里的位置，决定气泡应该弹到 6 个方向中的哪个：
 *
 * - 横向：始终有偏移；桌宠靠右屏 → 气泡向左，桌宠靠左屏 → 气泡向右。
 * - 纵向：桌宠在上 1/3 → 气泡向下；下 1/3 → 气泡向上；中段 → 与桌宠水平齐高（"正左/正右"）。
 *
 * 永远不弹"正上 / 正下"——避免遮挡桌面正中央的内容。
 */
export function computeBubbleDirection(
  pet: PetAnchor,
  workArea: { x: number; y: number; width: number; height: number }
): BubbleDirection {
  const horizontalIsLeft = pet.centerX < workArea.x + workArea.width / 2;
  const horizontal: "L" | "R" = horizontalIsLeft ? "R" : "L";

  const relY = pet.centerY - workArea.y;
  const h = workArea.height;
  let vertical: "T" | "B" | "" = "";
  if (relY < h / 3) vertical = "B";
  else if (relY > h * (2 / 3)) vertical = "T";

  return (vertical + horizontal) as BubbleDirection;
}

/**
 * 给定方向，反推气泡窗口在屏幕里的位置。
 *
 * 关键约束：尾巴尖始终指向桌宠 sprite 的中心点（横向接头/竖向头/腰）。
 * 算法：
 *   1. 确定"气泡矩形"哪条边与桌宠相邻（TL/TR → 底边，BL/BR → 顶边，L → 右边，R → 左边）。
 *   2. 那条边在屏幕上的位置 = 桌宠对应的边 ± (tailLength + petGap)。
 *   3. 沿那条边偏移 tailEdgeOffset 让尾巴对准桌宠中线（横向 → 接近桌宠 centerX；
 *      竖向 → 接近 centerY）。
 *   4. 反推气泡矩形左上角，再减去 outerPadding 得到窗口左上角。
 */
export function computeBubbleWindowBounds(
  pet: PetAnchor,
  dir: BubbleDirection,
  workArea: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const winW = BUBBLE_WINDOW_SIZE.width;
  const winH = BUBBLE_WINDOW_SIZE.height;
  const pad = BUBBLE_LAYOUT.outerPadding;
  const bw = BUBBLE_LAYOUT.bubbleWidth;
  const bh = BUBBLE_LAYOUT.bubbleHeight;
  const tail = BUBBLE_LAYOUT.tailLength;
  const gap = BUBBLE_LAYOUT.petGap;
  const edgeOffset = BUBBLE_LAYOUT.tailEdgeOffset;

  let bubbleScreenX: number;
  let bubbleScreenY: number;

  switch (dir) {
    case "TL": {
      // 气泡在桌宠左上：底边贴近桌宠头顶，尾巴在底边右侧（指向桌宠头）。
      // 尾巴尖 X = bubble.right - edgeOffset；要 ≈ pet.centerX，所以 bubble.right ≈ pet.centerX + edgeOffset。
      const bubbleRight = pet.centerX + edgeOffset;
      bubbleScreenX = bubbleRight - bw;
      bubbleScreenY = pet.topY - tail - gap - bh;
      break;
    }
    case "TR": {
      // 气泡在桌宠右上：底边贴近头顶，尾巴在底边左侧。
      const bubbleLeft = pet.centerX - edgeOffset;
      bubbleScreenX = bubbleLeft;
      bubbleScreenY = pet.topY - tail - gap - bh;
      break;
    }
    case "BL": {
      // 气泡在桌宠左下：顶边贴近脚底，尾巴在顶边右侧。
      const bubbleRight = pet.centerX + edgeOffset;
      bubbleScreenX = bubbleRight - bw;
      bubbleScreenY = pet.bottomY + tail + gap;
      break;
    }
    case "BR": {
      const bubbleLeft = pet.centerX - edgeOffset;
      bubbleScreenX = bubbleLeft;
      bubbleScreenY = pet.bottomY + tail + gap;
      break;
    }
    case "L": {
      // 正左：右边贴近桌宠左侧，尾巴在右边中央（指向桌宠 centerY）。
      bubbleScreenX = pet.leftX - tail - gap - bw;
      bubbleScreenY = pet.centerY - bh / 2;
      break;
    }
    case "R": {
      bubbleScreenX = pet.rightX + tail + gap;
      bubbleScreenY = pet.centerY - bh / 2;
      break;
    }
  }

  // 反推窗口位置；气泡矩形在窗口里固定从 (pad, pad) 开始。
  let winX = bubbleScreenX - pad;
  let winY = bubbleScreenY - pad;

  // clamp 到 workArea，避免气泡跑到屏幕外
  const margin = 6;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = workArea.x + workArea.width - winW - margin;
  const maxY = workArea.y + workArea.height - winH - margin;
  if (maxX >= minX) winX = Math.max(minX, Math.min(maxX, winX));
  else winX = minX;
  if (maxY >= minY) winY = Math.max(minY, Math.min(maxY, winY));
  else winY = minY;

  return {
    x: Math.round(winX),
    y: Math.round(winY),
    width: winW,
    height: winH
  };
}

/** 根据桌宠 BrowserWindow 的 bounds，估算桌宠 sprite 在屏幕里的实际锚点。 */
export function petAnchorFromBounds(petBounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): PetAnchor {
  // 桌宠 sprite 居底居中；sprite 估为 ~200×210，余量在窗口顶部和两侧。
  const spriteW = 200;
  const spriteH = 210;
  const centerX = petBounds.x + petBounds.width / 2;
  const bottomY = petBounds.y + petBounds.height - 8;
  const topY = bottomY - spriteH;
  const centerY = (topY + bottomY) / 2;
  return {
    centerX,
    centerY,
    topY,
    bottomY,
    leftX: centerX - spriteW / 2,
    rightX: centerX + spriteW / 2
  };
}

/** 拿到桌宠 BrowserWindow 所在的显示器 workArea。 */
export function getDisplayWorkAreaForPet(petBounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } {
  return screen.getDisplayMatching(petBounds).workArea;
}
