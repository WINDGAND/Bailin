import {
  blankImage,
  decodePng,
  encodePng,
  extract,
  paste,
  removeChromaBackground,
  normalizeTransparentRgb,
  countOpaquePixels,
  resize,
  type RawImage
} from "./png.js";

/**
 * Hatch-pet 兼容的裁帧 / 拼图 / 校验 / QA 工具。
 *
 * 所有 buffer 入参都假设是 PNG；其它格式调用方自行先转 PNG。
 */

export interface CellSpec {
  width: number;
  height: number;
}

export interface GridSpec {
  columns: number;
  rows: number;
}

export interface RowSlot {
  /** 0 起的行索引；用于决定 atlas 中 y 位置。 */
  rowIndex: number;
  /** 该行用到的实际帧数，必须 ≤ grid.columns。 */
  frameCount: number;
  /** 行 strip 的 PNG buffer；尺寸应为 (cell.w × frameCount) × cell.h。 */
  stripPng: Buffer;
  /** chroma key 颜色；不传则不做 chroma 去除。 */
  chromaKey?: { r: number; g: number; b: number };
  /** chroma key 阈值；默认 60。 */
  chromaThreshold?: number;
}

export interface ExtractedFrame {
  /** 0 起的列索引。 */
  index: number;
  /** PNG buffer，尺寸固定为 cell.w × cell.h。 */
  png: Buffer;
  /** 该帧的不透明像素数；空帧（全透明）= 0。 */
  opaquePixelCount: number;
}

/**
 * 从一行 strip 中按等宽切出 frameCount 帧。
 *
 * 参考 [extract_strip_frames.py](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/scripts/extract_strip_frames.py)
 * 的「slots」方法：直接按 frameCount 均匀切割，最稳。
 *
 * 切完后会：
 *   1. 把 chromaKey 像素抠成透明（如果传了 chromaKey）
 *   2. 把透明像素的 RGB 残留清零
 *   3. 统计 opaquePixelCount，便于校验空白帧
 */
export function extractStripFrames(
  slot: RowSlot,
  cell: CellSpec
): ExtractedFrame[] {
  let strip = decodePng(slot.stripPng);
  if (slot.chromaKey) {
    strip = removeChromaBackground(
      strip,
      slot.chromaKey,
      slot.chromaThreshold ?? 60
    );
  }
  strip = normalizeTransparentRgb(strip);

  const componentFrames = extractComponentFrames(strip, slot.frameCount, cell);
  if (componentFrames) return componentFrames;

  const slotWidth = strip.width / slot.frameCount;
  const frames: ExtractedFrame[] = [];
  for (let i = 0; i < slot.frameCount; i += 1) {
    const left = Math.round(i * slotWidth);
    const right = Math.round((i + 1) * slotWidth);
    let frame = extract(strip, left, 0, right - left, strip.height);
    frame = fitFrameToCell(frame, cell);
    frame = normalizeTransparentRgb(frame);
    frames.push({
      index: i,
      png: encodePng(frame),
      opaquePixelCount: countOpaquePixels(frame)
    });
  }
  return frames;
}

/**
 * 组件级裁帧：真实 image model 很难严格输出 (192×N)×208 strip。
 * 它常在 1024×1024 方图里画出 N 个独立小人，且小人可能跨越等宽 slot 边界。
 *
 * 这里先用「非透明列投影」找出独立角色块，再按 x 坐标排序取前 frameCount 个。
 * 如果找不到足够块，才回退到等宽 slot 裁切。
 */
function extractComponentFrames(
  strip: RawImage,
  frameCount: number,
  cell: CellSpec
): ExtractedFrame[] | null {
  const ranges = findConnectedComponents(strip, {
    minOpaquePixels: Math.max(24, Math.floor(strip.width * strip.height * 0.0002)),
    minWidth: Math.max(4, Math.floor(strip.width * 0.01)),
    minHeight: Math.max(4, Math.floor(strip.height * 0.01))
  });
  if (ranges.length === 0) return null;

  const edgeMargin = Math.max(8, Math.floor(strip.width * 0.015));
  const nonEdge = ranges.filter(
    (r) => r.x0 > edgeMargin && r.x1 < strip.width - 1 - edgeMargin
  );
  const plausibleSingleSprites = nonEdge.filter((r) => {
    const w = r.x1 - r.x0 + 1;
    const h = r.y1 - r.y0 + 1;
    return (
      w <= strip.width * 0.45 &&
      h <= strip.height * 0.92 &&
      w / Math.max(1, h) <= 1.1
    );
  });
  const center = centerOpaqueRange(strip);
  const source =
    plausibleSingleSprites.length >= 1
      ? plausibleSingleSprites
      : nonEdge.length >= 1
        ? nonEdge
        : pickEdgeOrCenter(ranges, center, strip);
  if (source.length < 1) return null;

  const expanded = buildCandidateFrames(strip, source, frameCount, cell);
  return expanded.map((frame, index) => {
    return {
      index,
      png: encodePng(frame),
      opaquePixelCount: countOpaquePixels(frame)
    };
  });
}

function buildCandidateFrames(
  strip: RawImage,
  source: OpaqueRange[],
  frameCount: number,
  cell: CellSpec
): RawImage[] {
  const pickedComponents = source
    .slice()
    .sort((a, b) => b.opaquePixels - a.opaquePixels)
    .slice(0, Math.min(frameCount, source.length))
    .sort((a, b) => a.x0 - b.x0);

  const frames = pickedComponents.map((range) => {
    let frame = extract(
      strip,
      range.x0,
      range.y0,
      range.x1 - range.x0 + 1,
      range.y1 - range.y0 + 1
    );
    frame = fitFrameToCell(frame, cell);
    return normalizeTransparentRgb(frame);
  });
  return resampleFrames(frames, frameCount);
}

function pickEdgeOrCenter(
  ranges: OpaqueRange[],
  center: OpaqueRange | null,
  strip: RawImage
): OpaqueRange[] {
  if (ranges.length === 0) return center ? [center] : [];
  const sorted = ranges.slice().sort((a, b) => b.opaquePixels - a.opaquePixels);
  const a = sorted[0];
  const b = sorted[1];
  if (a && b) {
    const aw = a.x1 - a.x0 + 1;
    const bw = b.x1 - b.x0 + 1;
    const areaRatio = b.opaquePixels / Math.max(1, a.opaquePixels);
    const bothPlausible =
      aw <= strip.width * 0.55 &&
      bw <= strip.width * 0.55 &&
      areaRatio >= 0.62;
    if (bothPlausible) {
      return [a, b].sort((x, y) => x.x0 - y.x0);
    }
  }
  return center ? [center] : sorted.slice(0, 1);
}

function resampleFrames(frames: RawImage[], frameCount: number): RawImage[] {
  if (frames.length === frameCount) return frames;
  if (frames.length === 0) return [];
  if (frames.length === 1) return Array.from({ length: frameCount }, () => frames[0]!);
  return Array.from({ length: frameCount }, (_, i) => {
    const srcIndex = Math.round((i / Math.max(1, frameCount - 1)) * (frames.length - 1));
    return frames[Math.min(frames.length - 1, srcIndex)]!;
  });
}

function centerOpaqueRange(img: RawImage): OpaqueRange | null {
  // 当模型只给出「左半个 + 中间完整 + 右半个」且边缘组件粘连时，
  // 选择画面中心区域通常能保住唯一完整角色，避免把左右边缘半身写进 atlas。
  const maxW = Math.floor(img.width * 0.42);
  const cx = Math.floor(img.width / 2);
  const x0 = Math.max(0, cx - Math.floor(maxW / 2));
  const x1 = Math.min(img.width - 1, x0 + maxW - 1);
  let y0 = img.height;
  let y1 = -1;
  let minX = x1;
  let maxX = x0;
  let opaquePixels = 0;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) === 0) continue;
      opaquePixels += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (opaquePixels === 0 || y1 < y0 || maxX < minX) return null;
  return { x0: minX, x1: maxX, y0, y1, opaquePixels };
}

interface OpaqueRange {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  opaquePixels: number;
}

function findConnectedComponents(
  img: RawImage,
  opts: { minOpaquePixels: number; minWidth: number; minHeight: number }
): OpaqueRange[] {
  const width = img.width;
  const height = img.height;
  const visited = new Uint8Array(width * height);
  const components: OpaqueRange[] = [];
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);

  const isOpaque = (x: number, y: number): boolean =>
    (img.data[(y * width + x) * 4 + 3] ?? 0) > 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x;
      if (visited[startIdx] || !isOpaque(x, y)) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[startIdx] = 1;

      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      let opaquePixels = 0;

      while (head < tail) {
        const cx = queueX[head]!;
        const cy = queueY[head]!;
        head += 1;
        opaquePixels += 1;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;

        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1]
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const idx = ny * width + nx;
          if (visited[idx] || !isOpaque(nx, ny)) continue;
          visited[idx] = 1;
          queueX[tail] = nx;
          queueY[tail] = ny;
          tail += 1;
        }
      }

      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (
        opaquePixels >= opts.minOpaquePixels &&
        w >= opts.minWidth &&
        h >= opts.minHeight
      ) {
        components.push({ x0, x1, y0, y1, opaquePixels });
      }
    }
  }

  return components;
}

/**
 * 把任意尺寸的 slot 等比缩放到目标 cell 中间。
 *
 * 真实生图 API（包括 gpt-image）通常只能返回 1024×1024 等固定尺寸；
 * 即使 prompt 要求生成「水平 strip」，模型也往往把 strip 画在方图里。
 * 因此裁帧器不能假设 slot 已经是 192×208，必须容忍任意 slot 尺寸。
 */
function fitFrameToCell(frame: RawImage, cell: CellSpec): RawImage {
  frame = keepDominantComponent(frame);
  frame = cropOpaqueBounds(frame, 8);
  if (frame.width === cell.width && frame.height === cell.height) {
    return frame;
  }
  const scale = Math.min(cell.width / frame.width, cell.height / frame.height);
  const w = Math.max(1, Math.round(frame.width * scale));
  const h = Math.max(1, Math.round(frame.height * scale));
  const resized = resize(frame, w, h);
  const out = blankImage(cell.width, cell.height);
  paste(out, resized, Math.floor((cell.width - w) / 2), Math.floor((cell.height - h) / 2));
  return out;
}

function keepDominantComponent(frame: RawImage): RawImage {
  const components = findConnectedComponents(frame, {
    minOpaquePixels: Math.max(8, Math.floor(frame.width * frame.height * 0.0005)),
    minWidth: 2,
    minHeight: 2
  });
  if (components.length <= 1) return frame;
  const centerX = frame.width / 2;
  const centerY = frame.height / 2;
  const best = components
    .slice()
    .sort((a, b) => {
      const acx = (a.x0 + a.x1) / 2;
      const acy = (a.y0 + a.y1) / 2;
      const bcx = (b.x0 + b.x1) / 2;
      const bcy = (b.y0 + b.y1) / 2;
      const ad = Math.hypot(acx - centerX, acy - centerY);
      const bd = Math.hypot(bcx - centerX, bcy - centerY);
      return b.opaquePixels - bd * 8 - (a.opaquePixels - ad * 8);
    })[0];
  if (!best) return frame;
  return extract(
    frame,
    best.x0,
    best.y0,
    best.x1 - best.x0 + 1,
    best.y1 - best.y0 + 1
  );
}

function cropOpaqueBounds(frame: RawImage, padding: number): RawImage {
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const a = frame.data[(y * frame.width + x) * 4 + 3] ?? 0;
      if (a === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    return frame;
  }
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(frame.width - 1, maxX + padding);
  maxY = Math.min(frame.height - 1, maxY + padding);
  return extract(frame, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

export interface AtlasComposeInput {
  /** 单格尺寸。 */
  cell: CellSpec;
  /** 网格布局。 */
  grid: GridSpec;
  /** 每一行的帧 PNG 列表。 */
  rows: Array<{
    rowIndex: number;
    framesPng: Buffer[];
  }>;
}

/**
 * 把每行帧拼成 (cell.w × grid.cols) × (cell.h × grid.rows) 的 atlas PNG。
 * 未使用的格子保持完全透明，符合 Codex Pet Contract。
 */
export function composeAtlas(input: AtlasComposeInput): Buffer {
  const { cell, grid } = input;
  const atlas = blankImage(
    cell.width * grid.columns,
    cell.height * grid.rows
  );
  for (const row of input.rows) {
    if (row.rowIndex < 0 || row.rowIndex >= grid.rows) {
      throw new Error(
        `composeAtlas: rowIndex=${row.rowIndex} 超出 grid.rows=${grid.rows}`
      );
    }
    for (let col = 0; col < row.framesPng.length && col < grid.columns; col += 1) {
      const png = row.framesPng[col];
      if (!png) continue;
      const frame = decodePng(png);
      if (frame.width !== cell.width || frame.height !== cell.height) {
        throw new Error(
          `composeAtlas: row ${row.rowIndex} col ${col} 帧尺寸 ${frame.width}×${frame.height} ≠ cell ${cell.width}×${cell.height}`
        );
      }
      paste(atlas, frame, col * cell.width, row.rowIndex * cell.height);
    }
  }
  return encodePng(normalizeTransparentRgb(atlas));
}

export interface AtlasValidationReport {
  ok: boolean;
  issues: string[];
  /** 每个行的 opaquePixelCount 列表（仅前 frameCount 帧）。 */
  rowPixelCounts: Array<{ rowIndex: number; perFrame: number[] }>;
  /** 多余格子（>= frameCount）是否全透明。 */
  trailingTransparent: boolean;
  /** atlas 尺寸是否与 grid × cell 一致。 */
  sizeOk: boolean;
}

export interface AtlasValidationInput {
  atlasPng: Buffer;
  cell: CellSpec;
  grid: GridSpec;
  /** 每行实际使用的帧数（≤ grid.columns）。键为 rowIndex。 */
  rowFrameCounts: Record<number, number>;
  /** 最少非透明像素数（防 sprite 完全空白 / 几乎全透明）。默认 cell.w × cell.h × 0.04。 */
  minOpaquePerFrame?: number;
}

export function validateAtlas(input: AtlasValidationInput): AtlasValidationReport {
  const issues: string[] = [];
  const { cell, grid } = input;
  const img = decodePng(input.atlasPng);
  const expectedW = cell.width * grid.columns;
  const expectedH = cell.height * grid.rows;
  const sizeOk = img.width === expectedW && img.height === expectedH;
  if (!sizeOk) {
    issues.push(
      `atlas 尺寸 ${img.width}×${img.height} ≠ 期望 ${expectedW}×${expectedH}`
    );
  }
  const minOpaque =
    input.minOpaquePerFrame ?? Math.floor(cell.width * cell.height * 0.04);
  const rowPixelCounts: AtlasValidationReport["rowPixelCounts"] = [];
  let trailingTransparent = true;

  for (let row = 0; row < grid.rows; row += 1) {
    const frameCount = input.rowFrameCounts[row];
    if (frameCount == null) {
      // 未声明的行视为完全透明
      for (let col = 0; col < grid.columns; col += 1) {
        const frame = extract(img, col * cell.width, row * cell.height, cell.width, cell.height);
        if (countOpaquePixels(frame) > 0) {
          trailingTransparent = false;
          issues.push(`row ${row} col ${col} 未声明却存在不透明像素`);
        }
      }
      continue;
    }
    const perFrame: number[] = [];
    for (let col = 0; col < grid.columns; col += 1) {
      const frame = extract(img, col * cell.width, row * cell.height, cell.width, cell.height);
      const count = countOpaquePixels(frame);
      if (col < frameCount) {
        perFrame.push(count);
        if (count < minOpaque) {
          issues.push(
            `row ${row} frame ${col} 不透明像素 ${count} < min ${minOpaque}，可能是空白帧`
          );
        }
      } else if (count > 0) {
        trailingTransparent = false;
        issues.push(
          `row ${row} col ${col}（超过 frameCount=${frameCount}）残留 ${count} 不透明像素`
        );
      }
    }
    rowPixelCounts.push({ rowIndex: row, perFrame });
  }

  return {
    ok: sizeOk && trailingTransparent && issues.length === 0,
    issues,
    rowPixelCounts,
    trailingTransparent,
    sizeOk
  };
}

export interface ContactSheetInput {
  /** 用于显示的帧 PNG 矩阵；每个 row 对应 hatch-pet 的一行状态。 */
  rows: Array<{
    label: string;
    framesPng: Buffer[];
  }>;
  /** 单格目标缩略尺寸。 */
  thumbCell: CellSpec;
  /** 缩略图之间的间隙（像素）。 */
  gap?: number;
  /** 背景色（RGBA）；默认深底浅边以便看清透明帧。 */
  backgroundColor?: { r: number; g: number; b: number; a: number };
}

/**
 * 制作 QA contact sheet：把所有行 × 所有帧缩成网格 PNG，便于人工肉眼检查。
 * 不画文本（pngjs 不带字体），label 仅用作可读 metadata，文件名层面会出现。
 */
export function makeContactSheet(input: ContactSheetInput): Buffer {
  const gap = input.gap ?? 4;
  const cellW = input.thumbCell.width;
  const cellH = input.thumbCell.height;
  const maxCols = Math.max(...input.rows.map((r) => r.framesPng.length), 1);
  const sheetW = maxCols * cellW + (maxCols + 1) * gap;
  const sheetH = input.rows.length * cellH + (input.rows.length + 1) * gap;
  const sheet = blankImage(sheetW, sheetH);
  const bg = input.backgroundColor ?? { r: 20, g: 24, b: 40, a: 255 };
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = bg.r;
    sheet.data[i + 1] = bg.g;
    sheet.data[i + 2] = bg.b;
    sheet.data[i + 3] = bg.a;
  }
  for (let rowI = 0; rowI < input.rows.length; rowI += 1) {
    const row = input.rows[rowI];
    if (!row) continue;
    for (let colI = 0; colI < row.framesPng.length; colI += 1) {
      const png = row.framesPng[colI];
      if (!png) continue;
      const frame = decodePng(png);
      const thumb =
        frame.width === cellW && frame.height === cellH
          ? frame
          : resize(frame, cellW, cellH);
      paste(
        sheet,
        thumb,
        gap + colI * (cellW + gap),
        gap + rowI * (cellH + gap)
      );
    }
  }
  return encodePng(sheet);
}

export interface PreviewInput {
  /** 用作预览的一行帧（通常 idle 或 running-right）。 */
  framesPng: Buffer[];
  /** 单格目标尺寸。 */
  cell: CellSpec;
}

/**
 * 制作 motion preview：把多帧拼成一行的横向条带 PNG，便于上传/分享时看动作循环。
 * 选用 PNG 而非 APNG 是为了零依赖；APNG 需要额外库。
 */
export function makePreviewStrip(input: PreviewInput): Buffer {
  const { cell } = input;
  const strip = blankImage(cell.width * input.framesPng.length, cell.height);
  for (let i = 0; i < input.framesPng.length; i += 1) {
    const png = input.framesPng[i];
    if (!png) continue;
    const frame = decodePng(png);
    const fitted =
      frame.width === cell.width && frame.height === cell.height
        ? frame
        : resize(frame, cell.width, cell.height);
    paste(strip, fitted, i * cell.width, 0);
  }
  return encodePng(strip);
}

export type {
  AtlasComposeInput as ComposeInput,
  AtlasValidationInput as ValidateInput,
  AtlasValidationReport as ValidateReport
};

export type { RawImage } from "./png.js";
