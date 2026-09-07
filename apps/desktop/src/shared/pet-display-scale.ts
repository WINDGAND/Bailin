/**
 * 桌宠窗口与精灵像素尺寸：把用户设置的显示缩放落到整数 DIP。
 *
 * 窗口内容区以 {@link PET_WINDOW_BASE_SIZE} 为 1.0 基准，再乘 clamp 后的 scale。
 * atlas 按单格像素缩放；DSL 还要乘程序里的 `displayScale`（1–4 的整数倍率）。
 * 全部为纯函数，不读写窗口、不碰 Electron。
 */

/** 桌宠窗口基准内容区尺寸（scale = 1.0）。 */
export const PET_WINDOW_BASE_SIZE = { width: 240, height: 260 } as const;

/** 用户可调缩放下限（75%）。 */
export const PET_DISPLAY_SCALE_MIN = 0.75;
/** 用户可调缩放上限（100%，与基准同大）。 */
export const PET_DISPLAY_SCALE_MAX = 1;
/** 设置项缺省 / 非法值时的回退缩放。 */
export const PET_DISPLAY_SCALE_DEFAULT = 0.9;
/** 滑块步进；clamp 时按此对齐，避免出现 0.87 这类无法用滑块回到的值。 */
export const PET_DISPLAY_SCALE_STEP = 0.05;

/** 主动陪伴气泡占用的高度（窗口动态扩展量）。 */
export const PROACTIVE_BUBBLE_EXTRA_HEIGHT = 100;

/**
 * 把未知输入钳到合法缩放区间，并按步进四舍五入。
 *
 * @param value 设置里读出的缩放；非有限数字则用默认值
 * @returns [MIN, MAX] 内、对齐 STEP 的数字
 */
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

/**
 * 当前显示缩放下的桌宠窗内容区宽高（整数像素）。
 *
 * @param scale 用户设置的 petDisplayScale
 * @returns 四舍五入后的宽高，供 BrowserWindow 设 content bounds
 */
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

/**
 * atlas 模式：单格像素 × 显示缩放，得到精灵绘制尺寸。
 *
 * @param cell 图集单格宽高（默认 192×208）
 * @param scale 用户显示缩放
 * @returns 四舍五入后的绘制宽高
 */
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

/**
 * DSL 模式：程序画布尺寸 × 程序倍率 × 用户显示缩放。
 *
 * @param size SpriteProgram.size（逻辑像素）
 * @param displayScale 程序内 1–4 整数倍率，与用户滑块无关
 * @param scale 用户显示缩放
 * @returns 四舍五入后的绘制宽高
 */
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
