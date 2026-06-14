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
  const strip = decodePng(slot.stripPng);
  if (strip.height !== cell.height) {
    throw new Error(
      `extractStripFrames: strip 高度 ${strip.height} 与 cell.height ${cell.height} 不一致`
    );
  }
  const slotWidth = strip.width / slot.frameCount;
  if (Math.abs(slotWidth - cell.width) > 1) {
    throw new Error(
      `extractStripFrames: strip 宽 ${strip.width} / frameCount ${slot.frameCount} ≈ ${slotWidth}，` +
        `与 cell.width ${cell.width} 偏差过大`
    );
  }
  const frames: ExtractedFrame[] = [];
  for (let i = 0; i < slot.frameCount; i += 1) {
    const left = Math.round(i * slotWidth);
    const right = Math.round((i + 1) * slotWidth);
    let frame = extract(strip, left, 0, right - left, cell.height);
    if (frame.width !== cell.width) {
      // 由于浮点 + round 偏差，最后一帧可能多 1 / 少 1 像素；居中 paste 到 cell.width
      const fitted = blankImage(cell.width, cell.height);
      const dx = Math.floor((cell.width - frame.width) / 2);
      paste(fitted, frame, dx, 0);
      frame = fitted;
    }
    if (slot.chromaKey) {
      frame = removeChromaBackground(
        frame,
        slot.chromaKey,
        slot.chromaThreshold ?? 60
      );
    }
    frame = normalizeTransparentRgb(frame);
    frames.push({
      index: i,
      png: encodePng(frame),
      opaquePixelCount: countOpaquePixels(frame)
    });
  }
  return frames;
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
