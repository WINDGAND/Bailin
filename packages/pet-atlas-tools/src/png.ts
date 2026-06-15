import { PNG } from "pngjs";

/**
 * PNG IO 与像素操作的薄封装。
 *
 * 设计原则：
 *   - PNG buffer ↔ RawImage 互转；其他 hatch-pet 工具一律用 RawImage 操作
 *   - 像素始终是 RGBA8（4 字节/像素），与 PNGjs / canvas / sharp 互通
 *   - 不掺任何 native 依赖；纯 JS + pngjs
 */
export interface RawImage {
  width: number;
  height: number;
  /** RGBA8 像素缓冲，长度 = width × height × 4。 */
  data: Buffer;
}

/** 解码 PNG buffer → RGBA8 像素矩阵。 */
export function decodePng(buffer: Buffer): RawImage {
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: ensureRgba(png as unknown as RawImage)
  };
}

function ensureRgba(img: RawImage): Buffer {
  // pngjs 默认 RGBA8；防御性 sanity check
  const expected = img.width * img.height * 4;
  if (img.data.length === expected) return Buffer.from(img.data);
  throw new Error(
    `decodePng: 期望 RGBA8 (${expected} bytes)，实际 ${img.data.length}`
  );
}

/** 用透明背景创建一张空白图。 */
export function blankImage(width: number, height: number): RawImage {
  return {
    width,
    height,
    data: Buffer.alloc(width * height * 4, 0)
  };
}

/** 编码 RGBA8 → PNG buffer。 */
export function encodePng(img: RawImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  // pngjs.data 是 Uint8ClampedArray-like，可直接拷
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

/** 从源图裁出一个矩形区域（按像素坐标）。 */
export function extract(
  src: RawImage,
  x: number,
  y: number,
  w: number,
  h: number
): RawImage {
  if (x < 0 || y < 0 || x + w > src.width || y + h > src.height) {
    throw new Error(
      `extract: 越界 (${x},${y} ${w}×${h}) vs src ${src.width}×${src.height}`
    );
  }
  const out = blankImage(w, h);
  for (let row = 0; row < h; row += 1) {
    const srcStart = ((y + row) * src.width + x) * 4;
    const dstStart = row * w * 4;
    src.data.copy(out.data, dstStart, srcStart, srcStart + w * 4);
  }
  return out;
}

/**
 * 把 src 像素按 (dx, dy) 粘贴到 dst；alpha < 0xff 走 source-over 透明合成。
 * 越界部分自动剪裁；不抛错。
 */
export function paste(dst: RawImage, src: RawImage, dx: number, dy: number): void {
  const x0 = Math.max(0, dx);
  const y0 = Math.max(0, dy);
  const x1 = Math.min(dst.width, dx + src.width);
  const y1 = Math.min(dst.height, dy + src.height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const sx = x - dx;
      const sy = y - dy;
      const sIdx = (sy * src.width + sx) * 4;
      const dIdx = (y * dst.width + x) * 4;
      const sa = src.data[sIdx + 3] ?? 0;
      if (sa === 0) continue;
      if (sa === 255) {
        dst.data[dIdx] = src.data[sIdx] ?? 0;
        dst.data[dIdx + 1] = src.data[sIdx + 1] ?? 0;
        dst.data[dIdx + 2] = src.data[sIdx + 2] ?? 0;
        dst.data[dIdx + 3] = 255;
        continue;
      }
      // source-over 合成
      const a = sa / 255;
      const inv = 1 - a;
      const dr = dst.data[dIdx] ?? 0;
      const dg = dst.data[dIdx + 1] ?? 0;
      const db = dst.data[dIdx + 2] ?? 0;
      const da = dst.data[dIdx + 3] ?? 0;
      dst.data[dIdx] = Math.round((src.data[sIdx] ?? 0) * a + dr * inv);
      dst.data[dIdx + 1] = Math.round((src.data[sIdx + 1] ?? 0) * a + dg * inv);
      dst.data[dIdx + 2] = Math.round((src.data[sIdx + 2] ?? 0) * a + db * inv);
      dst.data[dIdx + 3] = Math.min(255, sa + Math.round(da * inv));
    }
  }
}

/**
 * 双线性下采样。本工具不要求高保真，仅用于 contact-sheet / preview。
 */
export function resize(src: RawImage, targetW: number, targetH: number): RawImage {
  const out = blankImage(targetW, targetH);
  const sx = src.width / targetW;
  const sy = src.height / targetH;
  for (let y = 0; y < targetH; y += 1) {
    for (let x = 0; x < targetW; x += 1) {
      const px = Math.min(src.width - 1, Math.floor(x * sx));
      const py = Math.min(src.height - 1, Math.floor(y * sy));
      const sIdx = (py * src.width + px) * 4;
      const dIdx = (y * targetW + x) * 4;
      out.data[dIdx] = src.data[sIdx] ?? 0;
      out.data[dIdx + 1] = src.data[sIdx + 1] ?? 0;
      out.data[dIdx + 2] = src.data[sIdx + 2] ?? 0;
      out.data[dIdx + 3] = src.data[sIdx + 3] ?? 0;
    }
  }
  return out;
}

/**
 * 把接近 chromaKey 的像素抠成透明。
 * @param threshold 0~441，色距阈值（√(255²×3) ≈ 441）。常用 30~80。
 */
export function removeChromaBackground(
  img: RawImage,
  chromaKey: { r: number; g: number; b: number },
  threshold = 60
): RawImage {
  const out = blankImage(img.width, img.height);
  img.data.copy(out.data);
  const sq = threshold * threshold;
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i] ?? 0;
    const g = out.data[i + 1] ?? 0;
    const b = out.data[i + 2] ?? 0;
    const dr = r - chromaKey.r;
    const dg = g - chromaKey.g;
    const db = b - chromaKey.b;
    const nearKey = dr * dr + dg * dg + db * db <= sq;
    // gpt-image 经常会把纯绿幕画成带噪点/渐变的绿色光晕。
    // 对绿色 chroma key 额外使用“绿色占优”判定，避免残留大块绿背景
    // 被后续连通域当作角色组件。
    const greenDominant =
      chromaKey.g > 200 &&
      chromaKey.r < 40 &&
      chromaKey.b < 40 &&
      g > 110 &&
      g - r > 45 &&
      g - b > 45;
    if (nearKey || greenDominant) {
      out.data[i] = 0;
      out.data[i + 1] = 0;
      out.data[i + 2] = 0;
      out.data[i + 3] = 0;
    }
  }
  return out;
}

/**
 * 把完全透明的像素 RGB 也清零（Codex Pet Contract 要求：
 * 透明像素不得保留隐藏 RGB 残留，否则部分渲染器会出现彩边）。
 */
export function normalizeTransparentRgb(img: RawImage): RawImage {
  const out = blankImage(img.width, img.height);
  img.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if ((out.data[i + 3] ?? 0) === 0) {
      out.data[i] = 0;
      out.data[i + 1] = 0;
      out.data[i + 2] = 0;
    }
  }
  return out;
}

/** 统计一张图里非透明像素的数量。 */
export function countOpaquePixels(img: RawImage): number {
  let count = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if ((img.data[i] ?? 0) > 0) count += 1;
  }
  return count;
}
