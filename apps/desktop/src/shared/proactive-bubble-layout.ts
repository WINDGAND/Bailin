import type { ProactiveBubblePlacement } from "./ipc-contract.js";

/** 独立气泡窗内容区尺寸（方案 B：与桌宠窗分离）。 */
export const PROACTIVE_BUBBLE_WINDOW_SIZE = { width: 280, height: 132 } as const;

/** 气泡窗与桌宠窗之间的间距（屏幕坐标 px）。 */
export const PROACTIVE_BUBBLE_PET_GAP = 6;

/** 越过屏幕中线后保持当前方位，避免换向抖动。 */
export const PROACTIVE_BUBBLE_PLACEMENT_HYSTERESIS_PX = 80;

const PET_ANCHOR_RATIO = 0.88;

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 根据桌宠在屏幕上的矩形决定气泡在上方还是下方。 */
export function resolveProactiveBubblePlacementFromPetRect(
  pet: ScreenRect,
  displayHeight: number,
  current: ProactiveBubblePlacement | null = null
): ProactiveBubblePlacement {
  const anchorY = pet.y + pet.height * PET_ANCHOR_RATIO;
  const mid = displayHeight / 2;
  const h = PROACTIVE_BUBBLE_PLACEMENT_HYSTERESIS_PX;

  if (current === "above") {
    return anchorY > mid - h ? "above" : "below";
  }
  if (current === "below") {
    return anchorY > mid + h ? "above" : "below";
  }
  return anchorY > mid ? "above" : "below";
}

/** 计算独立气泡窗的屏幕位置（桌宠窗保持基准尺寸不变）。 */
export function computeProactiveBubbleWindowBounds(
  pet: ScreenRect,
  placement: ProactiveBubblePlacement,
  bubbleSize: { width: number; height: number } = PROACTIVE_BUBBLE_WINDOW_SIZE,
  gap: number = PROACTIVE_BUBBLE_PET_GAP
): ScreenRect {
  const petCenterX = pet.x + pet.width / 2;
  let x = Math.round(petCenterX - bubbleSize.width / 2);
  let y =
    placement === "above"
      ? Math.round(pet.y - gap - bubbleSize.height)
      : Math.round(pet.y + pet.height + gap);

  return { x, y, width: bubbleSize.width, height: bubbleSize.height };
}
