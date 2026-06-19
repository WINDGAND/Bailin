import type { ProactiveBubblePlacement } from "./ipc-contract.js";

/** 独立气泡窗内容区默认/上限尺寸（方案 B：与桌宠窗分离）。 */
export const PROACTIVE_BUBBLE_SIZE_LIMITS = {
  minWidth: 200,
  maxWidth: 320,
  minHeight: 64,
  maxHeight: 240
} as const;

export const PROACTIVE_BUBBLE_WINDOW_SIZE = {
  width: 300,
  height: 160
} as const;

export type ProactiveBubbleWindowSize = { width: number; height: number };

export function defaultProactiveBubbleWindowSize(): ProactiveBubbleWindowSize {
  return {
    width: PROACTIVE_BUBBLE_WINDOW_SIZE.width,
    height: PROACTIVE_BUBBLE_WINDOW_SIZE.height
  };
}

export function clampProactiveBubbleSize(size: {
  width: number;
  height: number;
}): { width: number; height: number } {
  const { minWidth, maxWidth, minHeight, maxHeight } = PROACTIVE_BUBBLE_SIZE_LIMITS;
  return {
    width: Math.round(Math.min(maxWidth, Math.max(minWidth, size.width))),
    height: Math.round(Math.min(maxHeight, Math.max(minHeight, size.height)))
  };
}

/** 气泡与桌宠精灵可视区之间的间距（屏幕坐标 px）。 */
export const PROACTIVE_BUBBLE_PET_GAP = 3;

/** 越过屏幕中线后保持当前方位，避免换向抖动。 */
export const PROACTIVE_BUBBLE_PLACEMENT_HYSTERESIS_PX = 80;

/** 精灵可视区约占桌宠窗高度（自底向上，与 flex-end 布局一致）。 */
const PET_VISUAL_HEIGHT_RATIO = 0.72;
/** 桌宠窗底边到精灵底边的留白（约等于 pet-wrap padding）。 */
const PET_VISUAL_BOTTOM_INSET_RATIO = 0.035;

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

/** 桌宠窗内精灵的可视矩形（屏幕坐标），用于气泡对齐「正上/正下」。 */
export function getPetVisualScreenRect(pet: ScreenRect): ScreenRect {
  const visualH = pet.height * PET_VISUAL_HEIGHT_RATIO;
  const bottomInset = pet.height * PET_VISUAL_BOTTOM_INSET_RATIO;
  const visualBottom = pet.y + pet.height - bottomInset;
  return {
    x: pet.x,
    y: visualBottom - visualH,
    width: pet.width,
    height: visualH
  };
}

/** 计算独立气泡窗的屏幕位置（桌宠窗保持基准尺寸不变）。 */
export function computeProactiveBubbleWindowBounds(
  pet: ScreenRect,
  placement: ProactiveBubblePlacement,
  bubbleSize: { width: number; height: number } = PROACTIVE_BUBBLE_WINDOW_SIZE,
  gap: number = PROACTIVE_BUBBLE_PET_GAP
): ScreenRect {
  const visual = getPetVisualScreenRect(pet);
  const centerX = pet.x + pet.width / 2;
  const x = Math.round(centerX - bubbleSize.width / 2);
  const y =
    placement === "above"
      ? Math.round(visual.y - gap - bubbleSize.height)
      : Math.round(visual.y + visual.height + gap);

  return { x, y, width: bubbleSize.width, height: bubbleSize.height };
}
