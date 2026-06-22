/**
 * 给桌宠窗口判断"鼠标当前像素是否在 alpha > 0 的实体区域"。
 * 用于决定是否启用鼠标穿透（详见 README「架构」· Pet 窗口）。
 */

export function buildAlphaMask(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
): Uint8Array {
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    mask[p] = (data[i + 3] ?? 0) > 8 ? 1 : 0;
  }
  return mask;
}

export function isPointSolid(mask: Uint8Array, width: number, x: number, y: number): boolean {
  if (x < 0 || y < 0) return false;
  const flatIndex = y * width + x;
  return (mask[flatIndex] ?? 0) === 1;
}
