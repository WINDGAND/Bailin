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
 * 把接近 chromaKey 的像素抠成透明（边界连通 flood-fill，避免误抠角色内部同色像素）。
 */
export interface ChromaRemovalOptions {
  chromaKey: { r: number; g: number; b: number };
  /** 边界播种用的严格阈值（0~441 色距）。 */
  seedThreshold: number;
  /** flood 扩展可略宽，默认 seedThreshold + 8。 */
  spillThreshold?: number;
  /** 绿幕专用：扩展阶段是否启用 greenDominant 判定。 */
  greenSpill?: boolean;
  /** 边缘去溢色阈值（仅作用于贴透明边的像素；默认 spill + 18）。 */
  edgeSpillThreshold?: number;
  /**
   * 边缘去溢色的"渐变处理"外边界（色距超过此值才算确定是前景，完全不碰）。
   * 默认 edgeSpillThreshold × 2。这个区间只影响贴透明边的单圈像素（不会
   * 扩散到角色内部），把过去"色距超过 edgeSpillThreshold 就完全不处理、留下
   * 白边/绿边"的像素纳入去溢色范围。
   *
   * 数值越大，能扫除的溢色范围越广，但对贴着轮廓边缘、颜色本身就偏淡的纯色
   * 前景像素（比如肤色贴白色 chroma 背景，色距天然就不大）产生误判的风险也
   * 越高——色距无法区分"这个像素是真的抗锯齿过渡色"还是"这个像素本来就是
   * 这个颜色，只是刚好离 chroma 不远"。×2 是经过实测校验的保守取值：
   * 实测 #f3d3b1 肤色贴白色 chroma（色距 ≈90.5）时，×2（白色阈值下 76）能让
   * 它落在处理区间之外、保持不变；而 edge+100（≈138）会把它也判进去，产生
   * 新的色斑/半透明缺陷。如果以后要调大这个值，务必先用真实肤色/浅色前景
   * 像素回归验证，不要只看合成的纯背景过渡像素。
   */
  edgeDecontaminateThreshold?: number;
  /** 可清除的内部 chroma 孤岛最大像素数（默认 0 = 关闭，避免误伤白裙/高光）。 */
  maxInteriorChromaIsland?: number;
  /** 内部孤岛判定阈值（默认同 seedThreshold，比 spill 更严）。 */
  interiorChromaThreshold?: number;
}

function colorDistSq(
  r: number,
  g: number,
  b: number,
  key: { r: number; g: number; b: number }
): number {
  const dr = r - key.r;
  const dg = g - key.g;
  const db = b - key.b;
  return dr * dr + dg * dg + db * db;
}

function isNearChroma(
  r: number,
  g: number,
  b: number,
  key: { r: number; g: number; b: number },
  thresholdSq: number
): boolean {
  return colorDistSq(r, g, b, key) <= thresholdSq;
}

function isGreenDominantPixel(
  r: number,
  g: number,
  b: number,
  chromaKey: { r: number; g: number; b: number }
): boolean {
  return (
    chromaKey.g > 200 &&
    chromaKey.r < 40 &&
    chromaKey.b < 40 &&
    g > 110 &&
    g - r > 45 &&
    g - b > 45
  );
}

function isTransparentAlpha(a: number): boolean {
  return a < 16;
}

function isChromaSeedPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  key: { r: number; g: number; b: number },
  seedSq: number
): boolean {
  if (isTransparentAlpha(a)) return true;
  return isNearChroma(r, g, b, key, seedSq);
}

function isChromaSpillPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  key: { r: number; g: number; b: number },
  spillSq: number,
  greenSpill: boolean
): boolean {
  if (isTransparentAlpha(a)) return true;
  if (isNearChroma(r, g, b, key, spillSq)) return true;
  if (greenSpill && isGreenDominantPixel(r, g, b, key)) return true;
  return false;
}

/**
 * 边界连通 chroma 抠像：仅清除与图像边缘连通的背景色像素。
 */
export function removeChromaBackgroundConnected(
  img: RawImage,
  opts: ChromaRemovalOptions
): RawImage {
  const out = blankImage(img.width, img.height);
  img.data.copy(out.data);
  const { width, height, data } = out;
  const seedSq = opts.seedThreshold * opts.seedThreshold;
  const spillThreshold = opts.spillThreshold ?? opts.seedThreshold + 8;
  const spillSq = spillThreshold * spillThreshold;
  const greenSpill = opts.greenSpill ?? false;
  const key = opts.chromaKey;

  const marked = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const tryEnqueue = (x: number, y: number, asSeed: boolean): void => {
    const idx = y * width + x;
    if (marked[idx]) return;
    const i = idx * 4;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    const ok = asSeed
      ? isChromaSeedPixel(r, g, b, a, key, seedSq)
      : isChromaSpillPixel(r, g, b, a, key, spillSq, greenSpill);
    if (!ok) return;
    marked[idx] = 1;
    queueX[tail] = x;
    queueY[tail] = y;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    tryEnqueue(x, 0, true);
    tryEnqueue(x, height - 1, true);
  }
  for (let y = 0; y < height; y += 1) {
    tryEnqueue(0, y, true);
    tryEnqueue(width - 1, y, true);
  }

  while (head < tail) {
    const x = queueX[head]!;
    const y = queueY[head]!;
    head += 1;
    if (x > 0) tryEnqueue(x - 1, y, false);
    if (x + 1 < width) tryEnqueue(x + 1, y, false);
    if (y > 0) tryEnqueue(x, y - 1, false);
    if (y + 1 < height) tryEnqueue(x, y + 1, false);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!marked[y * width + x]) continue;
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  return out;
}

function clearPixel(data: Buffer, i: number): void {
  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 0;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 去溢色 alpha 越小越可能是残留背景，不值得再花力气反解颜色——直接当作
 * "确定是背景"整像素清零，避免除以接近 0 的 alpha 导致颜色值爆炸。
 */
const MIN_DESPILL_ALPHA = 0.06;

/**
 * 抗锯齿边缘像素去溢色（despill / color decontamination）。
 *
 * 假设观测颜色是「真实前景色」与「chroma 背景色」按 alpha 混合的结果：
 *   observed = alpha × fg + (1 - alpha) × chroma
 * 反解出 fg（标准 chroma key 去溢色公式），并夹到 0~255。
 */
function decontaminateColor(
  r: number,
  g: number,
  b: number,
  key: { r: number; g: number; b: number },
  alpha: number
): { r: number; g: number; b: number } {
  const inv = 1 - alpha;
  return {
    r: clamp255((r - inv * key.r) / alpha),
    g: clamp255((g - inv * key.g) / alpha),
    b: clamp255((b - inv * key.b) / alpha)
  };
}

function isChromaResiduePixel(
  r: number,
  g: number,
  b: number,
  a: number,
  key: { r: number; g: number; b: number },
  thresholdSq: number,
  greenSpill: boolean
): boolean {
  if (isTransparentAlpha(a)) return false;
  if (isNearChroma(r, g, b, key, thresholdSq)) return true;
  if (greenSpill && isGreenDominantPixel(r, g, b, key)) return true;
  return false;
}

function touchesTransparentNeighbor(
  data: Buffer,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const na = data[(ny * width + nx) * 4 + 3] ?? 0;
      if (isTransparentAlpha(na)) return true;
    }
  }
  return false;
}

/**
 * 抠像后精修：仅清除贴透明边的 chroma 溢色（外圈白/绿边）。
 * 内部 chroma 孤岛清除默认关闭（maxInteriorChromaIsland=0），防止误抠白裙/浅发。
 */
export function polishChromaMatte(
  img: RawImage,
  opts: ChromaRemovalOptions
): RawImage {
  const out = blankImage(img.width, img.height);
  img.data.copy(out.data);
  const { width, height, data } = out;
  const spillThreshold = opts.spillThreshold ?? opts.seedThreshold + 8;
  const edgeThreshold =
    opts.edgeSpillThreshold ?? opts.seedThreshold + 10;
  const islandThreshold = opts.interiorChromaThreshold ?? opts.seedThreshold;
  const maxIsland = opts.maxInteriorChromaIsland ?? 0;
  const edgeSq = edgeThreshold * edgeThreshold;
  const islandSq = islandThreshold * islandThreshold;
  const greenSpill = opts.greenSpill ?? false;
  const key = opts.chromaKey;
  const decontaminateThreshold = opts.edgeDecontaminateThreshold ?? edgeThreshold * 2;
  const decontaminateSq = decontaminateThreshold * decontaminateThreshold;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (isTransparentAlpha(a)) continue;
      let touchesTrans = false;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (isTransparentAlpha(data[(ny * width + nx) * 4 + 3] ?? 0)) {
          touchesTrans = true;
          break;
        }
      }
      if (!touchesTrans) continue;

      const distSq = colorDistSq(r, g, b, key);
      if (distSq <= edgeSq) {
        // 色距非常接近 chroma：和旧版行为一致，直接整像素清零。
        clearPixel(data, i);
        continue;
      }
      if (distSq >= decontaminateSq) {
        // 色距已经足够远，判定为确定的前景，不碰（和旧版行为一致）。
        continue;
      }
      // 过渡带：按色距做线性 alpha 估计（越接近 chroma alpha 越低），
      // 再用 alpha 反解出去掉背景色分量的真实前景色，而不是简单地留或删。
      // 注意：这是一个近似估计，不是精确的 matting 解——线性映射隐含假设
      // "前景色到 chroma 的全程色距 = 过渡带宽度"，这个假设对多数真实前景色
      // 并不成立，过渡带中段（约 50% 混合）的颜色还原可能有明显误差。
      // 即便如此，比起原来"整像素清零或完全不处理"的二元结果，渐变 alpha +
      // 部分去溢色仍是净改善；要做到精确还原需要真正的 trimap matting，
      // 超出本次修复范围。
      const dist = Math.sqrt(distSq);
      const alpha = clamp01((dist - edgeThreshold) / (decontaminateThreshold - edgeThreshold));
      if (alpha <= MIN_DESPILL_ALPHA) {
        clearPixel(data, i);
        continue;
      }
      const decontaminated = decontaminateColor(r, g, b, key, alpha);
      data[i] = decontaminated.r;
      data[i + 1] = decontaminated.g;
      data[i + 2] = decontaminated.b;
      data[i + 3] = clamp255(alpha * 255);
    }
  }

  if (maxIsland <= 0) return out;

  const visited = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x;
      if (visited[startIdx]) continue;
      const si = startIdx * 4;
      const sa = data[si + 3] ?? 0;
      const sr = data[si] ?? 0;
      const sg = data[si + 1] ?? 0;
      const sb = data[si + 2] ?? 0;
      if (
        isTransparentAlpha(sa) ||
        !isChromaResiduePixel(sr, sg, sb, sa, key, islandSq, greenSpill)
      ) {
        continue;
      }

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[startIdx] = 1;

      const component: number[] = [startIdx];
      let touchesBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;

      while (head < tail) {
        const cx = queueX[head]!;
        const cy = queueY[head]!;
        head += 1;
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1]
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const idx = ny * width + nx;
          if (visited[idx]) continue;
          const ni = idx * 4;
          const na = data[ni + 3] ?? 0;
          const nr = data[ni] ?? 0;
          const ng = data[ni + 1] ?? 0;
          const nb = data[ni + 2] ?? 0;
          if (
            isTransparentAlpha(na) ||
            !isChromaResiduePixel(nr, ng, nb, na, key, islandSq, greenSpill)
          ) {
            continue;
          }
          visited[idx] = 1;
          component.push(idx);
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail += 1;
          if (nx === 0 || ny === 0 || nx === width - 1 || ny === height - 1) {
            touchesBorder = true;
          }
        }
      }

      if (!touchesBorder && component.length <= maxIsland) {
        for (const idx of component) {
          clearPixel(data, idx * 4);
        }
      }
    }
  }

  return out;
}

/**
 * 检测 PNG 是否已具备有效原生透明通道（可跳过 chroma 抠像）。
 */
export function detectNativeTransparency(img: RawImage): boolean {
  const { width, height, data } = img;
  if (width < 8 || height < 8) return false;

  let borderTotal = 0;
  let borderTransparent = 0;
  const sampleBorder = (x: number, y: number): void => {
    borderTotal += 1;
    const a = data[(y * width + x) * 4 + 3] ?? 0;
    if (isTransparentAlpha(a)) borderTransparent += 1;
  };
  for (let x = 0; x < width; x += 1) {
    sampleBorder(x, 0);
    sampleBorder(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    sampleBorder(0, y);
    sampleBorder(width - 1, y);
  }
  if (borderTotal === 0 || borderTransparent / borderTotal < 0.6) return false;

  const cx0 = Math.floor(width * 0.25);
  const cx1 = Math.ceil(width * 0.75);
  const cy0 = Math.floor(height * 0.25);
  const cy1 = Math.ceil(height * 0.75);
  let centerOpaque = 0;
  let centerTotal = 0;
  for (let y = cy0; y < cy1; y += 1) {
    for (let x = cx0; x < cx1; x += 1) {
      centerTotal += 1;
      const a = data[(y * width + x) * 4 + 3] ?? 0;
      if (a >= 128) centerOpaque += 1;
    }
  }
  const minCenterOpaque = Math.max(32, Math.floor(centerTotal * 0.02));
  return centerOpaque >= minCenterOpaque;
}

export interface RepairInteriorHolesOptions {
  /** 超过此像素数的内部洞不填充（默认无限制）。 */
  maxHolePixels?: number;
}

/**
 * 填充不与图像边界连通的内部透明洞。
 */
export function repairInteriorAlphaHoles(
  img: RawImage,
  opts: RepairInteriorHolesOptions = {}
): RawImage {
  const out = blankImage(img.width, img.height);
  img.data.copy(out.data);
  const { width, height, data } = out;
  const exterior = markExteriorTransparent(data, width, height);

  const holes: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const a = data[idx * 4 + 3] ?? 0;
      if (isTransparentAlpha(a) && !exterior[idx]) {
        holes.push({ x, y });
      }
    }
  }

  if (holes.length === 0) return out;
  if (opts.maxHolePixels != null && holes.length > opts.maxHolePixels) return out;

  for (const { x, y } of holes) {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = (ny * width + nx) * 4;
        const na = data[ni + 3] ?? 0;
        if (na < 128) continue;
        rs.push(data[ni] ?? 0);
        gs.push(data[ni + 1] ?? 0);
        bs.push(data[ni + 2] ?? 0);
      }
    }
    const i = (y * width + x) * 4;
    if (rs.length === 0) continue;
    rs.sort((a, b) => a - b);
    gs.sort((a, b) => a - b);
    bs.sort((a, b) => a - b);
    const mid = Math.floor(rs.length / 2);
    data[i] = rs[mid] ?? 0;
    data[i + 1] = gs[mid] ?? 0;
    data[i + 2] = bs[mid] ?? 0;
    data[i + 3] = 255;
  }
  return out;
}

/** 统计不与边界连通的透明像素数（内部洞）。 */
export function countInteriorTransparentPixels(img: RawImage): number {
  const { width, height, data } = img;
  const exterior = markExteriorTransparent(data, width, height);
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const a = data[idx * 4 + 3] ?? 0;
      if (isTransparentAlpha(a) && !exterior[idx]) count += 1;
    }
  }
  return count;
}

function markExteriorTransparent(
  data: Buffer,
  width: number,
  height: number
): Uint8Array {
  const exterior = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const tryEnqueue = (x: number, y: number): void => {
    const idx = y * width + x;
    if (exterior[idx]) return;
    const a = data[idx * 4 + 3] ?? 0;
    if (!isTransparentAlpha(a)) return;
    exterior[idx] = 1;
    queueX[tail] = x;
    queueY[tail] = y;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    tryEnqueue(x, 0);
    tryEnqueue(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    tryEnqueue(0, y);
    tryEnqueue(width - 1, y);
  }

  while (head < tail) {
    const x = queueX[head]!;
    const y = queueY[head]!;
    head += 1;
    if (x > 0) tryEnqueue(x - 1, y);
    if (x + 1 < width) tryEnqueue(x + 1, y);
    if (y > 0) tryEnqueue(x, y - 1);
    if (y + 1 < height) tryEnqueue(x, y + 1);
  }
  return exterior;
}

/**
 * 把接近 chromaKey 的像素抠成透明。
 * @param threshold 0~441，色距阈值（√(255²×3) ≈ 441）。常用 30~80。
 * @deprecated 请优先使用 removeChromaBackgroundConnected；此函数保留兼容旧调用。
 */
export function removeChromaBackground(
  img: RawImage,
  chromaKey: { r: number; g: number; b: number },
  threshold = 60
): RawImage {
  const isGreenKey = chromaKey.g > 200 && chromaKey.r < 40 && chromaKey.b < 40;
  return removeChromaBackgroundConnected(img, {
    chromaKey,
    seedThreshold: threshold,
    spillThreshold: threshold,
    greenSpill: isGreenKey
  });
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
