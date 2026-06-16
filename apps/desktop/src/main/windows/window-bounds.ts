import { screen, type BrowserWindow } from "electron";

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 将窗口左上角限制在 workArea 内，保证整块窗口可见。
 * 纯函数，便于单测与 verify 脚本复用。
 */
export function clampPositionToWorkArea(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: WorkAreaRect,
  margin = 8
): { x: number; y: number } {
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = workArea.x + workArea.width - width - margin;
  const maxY = workArea.y + workArea.height - height - margin;

  const clampedX = maxX < minX ? minX : Math.min(Math.max(x, minX), maxX);
  const clampedY = maxY < minY ? minY : Math.min(Math.max(y, minY), maxY);

  return { x: Math.round(clampedX), y: Math.round(clampedY) };
}

/** 根据窗口当前矩形匹配显示器，并限制在对应 workArea 内。 */
export function clampRectToWorkArea(rect: BoundsRect, margin = 8): { x: number; y: number } {
  const display = screen.getDisplayMatching(rect);
  return clampPositionToWorkArea(rect.x, rect.y, rect.width, rect.height, display.workArea, margin);
}

/** 若桌宠窗口越界则拉回屏幕内。 */
export function clampPetWindow(win: BrowserWindow, margin = 8): { x: number; y: number } {
  const bounds = win.getBounds();
  const clamped = clampRectToWorkArea(bounds, margin);
  if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
    win.setPosition(clamped.x, clamped.y);
  }
  return clamped;
}
