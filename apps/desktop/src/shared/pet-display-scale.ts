/** 桌宠窗口基准内容区尺寸（scale = 1.0）。 */
export const PET_WINDOW_BASE_SIZE = { width: 240, height: 260 } as const;

export const PET_DISPLAY_SCALE_MIN = 0.75;
export const PET_DISPLAY_SCALE_MAX = 1.5;
export const PET_DISPLAY_SCALE_DEFAULT = 1;
export const PET_DISPLAY_SCALE_STEP = 0.05;

export function clampPetDisplayScale(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : PET_DISPLAY_SCALE_DEFAULT;
  const clamped = Math.min(
    PET_DISPLAY_SCALE_MAX,
    Math.max(PET_DISPLAY_SCALE_MIN, n)
  );
  return (
    Math.round(clamped / PET_DISPLAY_SCALE_STEP) * PET_DISPLAY_SCALE_STEP
  );
}

export function getPetWindowSize(scale: number): {
  width: number;
  height: number;
} {
  const s = clampPetDisplayScale(scale);
  return {
    width: Math.round(PET_WINDOW_BASE_SIZE.width * s),
    height: Math.round(PET_WINDOW_BASE_SIZE.height * s)
  };
}

export function resolveAtlasPetPixelSize(
  cell: { width: number; height: number },
  scale: number
): { width: number; height: number } {
  const s = clampPetDisplayScale(scale);
  return {
    width: Math.round(cell.width * s),
    height: Math.round(cell.height * s)
  };
}

export function resolveDslPetPixelSize(
  size: { width: number; height: number },
  displayScale: number,
  scale: number
): { width: number; height: number } {
  const s = clampPetDisplayScale(scale);
  return {
    width: Math.round(size.width * displayScale * s),
    height: Math.round(size.height * displayScale * s)
  };
}
