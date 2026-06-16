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

/** 根据窗口当前矩形匹配显示器，并限制在对应 workArea 内（保留任务栏边距）。 */
export function clampRectToWorkArea(rect: BoundsRect, margin = 8): { x: number; y: number } {
  const display = screen.getDisplayMatching(rect);
  return clampPositionToWorkArea(rect.x, rect.y, rect.width, rect.height, display.workArea, margin);
}

/** 根据窗口当前矩形匹配显示器，并限制在完整屏幕 bounds 内。 */
export function clampRectToDisplayBounds(rect: BoundsRect, margin = 0): { x: number; y: number } {
  const display = screen.getDisplayMatching(rect);
  return clampPositionToWorkArea(rect.x, rect.y, rect.width, rect.height, display.bounds, margin);
}

/**
 * 桌宠拖回屏幕内的统一入口。
 *
 * 历史上这里默认走 workArea + margin 8，叠加"启动恢复 / 切角色都重新 clamp 并写回 vault"的链路，
 * 会让桌宠每次启动 / 切角色都被向中心方向收 ~50px——多次后用户能感觉到的就是
 * "桌宠的活动范围越用越小，最后只能在一条线上拖"。
 *
 * 现在统一用完整 display.bounds + margin 0：桌宠可以一直触达物理屏幕边缘，
 * 永远不会被任务栏 / 安全边距悄悄收缩可达范围。
 *
 * 而且：取位置和写位置都走 content 系列 API（getContentBounds / setContentBounds），
 * 配合调用方传入的固定 size，规避 electron#27651 在 Windows 非整数 DPI 下
 * 反复 setBounds/setPosition 让窗口物理尺寸"长大"的累积 bug —— 这个 bug
 * 也是用户能直观感觉到的"活动范围越用越小"的根因之一。
 */
export function clampPetWindow(
  win: BrowserWindow,
  size?: { width: number; height: number }
): { x: number; y: number } {
  const content = win.getContentBounds();
  const width = size?.width ?? content.width;
  const height = size?.height ?? content.height;
  const clamped = clampRectToDisplayBounds({ x: content.x, y: content.y, width, height }, 0);
  if (clamped.x !== content.x || clamped.y !== content.y) {
    win.setContentBounds({ x: clamped.x, y: clamped.y, width, height });
  }
  return clamped;
}
