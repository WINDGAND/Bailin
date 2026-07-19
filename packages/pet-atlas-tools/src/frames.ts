import {
  blankImage,
  decodePng,
  encodePng,
  extract,
  paste,
  removeChromaBackgroundConnected,
  polishChromaMatte,
  detectNativeTransparency,
  repairInteriorAlphaHoles,
  normalizeTransparentRgb,
  countOpaquePixels,
  countInteriorTransparentPixels,
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

/** 行级垂直锚定策略：站立类锁脚底，位移类保留纵向动效。 */
export type RowAlignMode = "standing" | "motion";

export interface RowAlignOptions {
  alignMode?: RowAlignMode;
  /** 脚底距 cell 底边的安全边距；默认 12。 */
  safeMargin?: number;
  /** cropOpaqueBounds 额外 padding；默认 8。 */
  bboxPadding?: number;
  /**
   * 跨行统一 scale（见 computeCanonicalBodyScale）。传入时作为该行 scale 的起点，
   * 而不是仅用本行自己的 maxW / maxContentH 计算——这是修复「idle 和 running 大小不一致」
   * 的关键：所有行必须共用同一个身体尺度锚点，各行只在自己需要更小时才继续收缩
   * （水平越界 / 站立行超高仍会各自 clamp，不会变得比 forcedScale 更大）。
   */
  forcedScale?: number;
}

export interface RowSlot {
  /** 0 起的行索引；用于决定 atlas 中 y 位置。 */
  rowIndex: number;
  /** 该行用到的实际帧数，必须 ≤ grid.columns。 */
  frameCount: number;
  /** 行 strip 的 PNG buffer；尺寸应为 (cell.w × frameCount) × cell.h。 */
  stripPng: Buffer;
  /** hatch-pet 行状态；决定 standing / motion 垂直锚定。 */
  rowState?: string;
  /** 等宽 slot 切缝内缩像素；默认 1，去掉邻帧边界污染。 */
  slotInset?: number;
  /** 脚底安全边距；默认 12。 */
  safeMargin?: number;
  /** chroma key 颜色；不传则不做 chroma 去除。 */
  chromaKey?: { r: number; g: number; b: number };
  /** chroma 边界播种阈值；默认 60。 */
  chromaThreshold?: number;
  /** chroma 边界播种阈值（优先于 chromaThreshold）。 */
  chromaSeedThreshold?: number;
  /** chroma flood 扩展阈值。 */
  chromaSpillThreshold?: number;
  /** 绿幕扩展阶段启用 greenDominant。 */
  chromaGreenSpill?: boolean;
  /** 为 true 时即使检测到原生透明也强制跑 chroma。 */
  forceChroma?: boolean;
}

export type ChromaStrategy = "green" | "white" | "native-alpha";

/** 根据 chroma key 推断策略标签。 */
export function inferChromaStrategy(
  chromaKey: { r: number; g: number; b: number }
): "green" | "white" {
  if (chromaKey.g > 200 && chromaKey.r < 40 && chromaKey.b < 40) return "green";
  return "white";
}

/** strip 抠像链：连通 chroma → 内部 alpha 洞修复 → 边缘/发缝精修 → RGB 归一化。 */
export function applyStripChromaPipeline(strip: RawImage, slot: RowSlot): RawImage {
  let processed = strip;
  if (slot.chromaKey) {
    const skipChroma = slot.forceChroma !== true && detectNativeTransparency(processed);
    if (!skipChroma) {
      const key = slot.chromaKey;
      const isGreenKey = inferChromaStrategy(key) === "green";
      const seed = slot.chromaSeedThreshold ?? slot.chromaThreshold ?? 60;
      const spill =
        slot.chromaSpillThreshold ?? seed + (isGreenKey ? 15 : 10);
      const edgeSpill = seed + (isGreenKey ? 10 : 8);
      // 绿幕常被头发/四肢包成小块孤岛；只清除接近纯 key 色的小孤岛，
      // 避免把角色内部大面积或低亮度绿色服饰当背景。
      // 生图 strip 往往是 1024px 方图，缩进 atlas 后约缩小 4-5 倍；
      // 目标帧里约 70px 的绿幕洞在原图可能超过 1,500px。
      const maxIsland = isGreenKey ? 4096 : 0;
      const chromaOpts = {
        chromaKey: key,
        seedThreshold: seed,
        spillThreshold: spill,
        greenSpill: slot.chromaGreenSpill ?? isGreenKey,
        edgeSpillThreshold: edgeSpill,
        maxInteriorChromaIsland: maxIsland,
        interiorChromaThreshold: seed
      };
      processed = removeChromaBackgroundConnected(processed, chromaOpts);
      processed = repairInteriorAlphaHoles(processed);
      processed = polishChromaMatte(processed, chromaOpts);
      processed = repairInteriorAlphaHoles(processed);
    }
  } else {
    processed = repairInteriorAlphaHoles(processed);
  }
  return normalizeTransparentRgb(processed);
}

/** 解析 strip 实际使用的 chroma 策略（供 hatch-run 落盘）。 */
export function resolveStripChromaStrategy(strip: RawImage, slot: RowSlot): ChromaStrategy {
  if (!slot.chromaKey) return "native-alpha";
  if (slot.forceChroma !== true && detectNativeTransparency(strip)) {
    return "native-alpha";
  }
  return inferChromaStrategy(slot.chromaKey);
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
const MOTION_ROW_STATES = new Set([
  "running-right",
  "running-left",
  "jumping",
  "running",
  "failed"
]);

/** 根据 hatch 行状态推断垂直锚定模式。 */
export function resolveRowAlignMode(rowState?: string | null): RowAlignMode {
  if (rowState && MOTION_ROW_STATES.has(rowState)) return "motion";
  return "standing";
}

function buildRowAlignOptions(slot: RowSlot): RowAlignOptions {
  return {
    alignMode: resolveRowAlignMode(slot.rowState),
    safeMargin: slot.safeMargin ?? 12,
    bboxPadding: 8
  };
}

export function extractStripFrames(
  slot: RowSlot,
  cell: CellSpec,
  opts?: { forcedScale?: number }
): ExtractedFrame[] {
  const rawFrames = selectStripRawFrames(slot, cell);
  const alignOpts = buildRowAlignOptions(slot);
  return finalizeAlignedFrames(rawFrames, cell, {
    ...alignOpts,
    forcedScale: opts?.forcedScale
  });
}

/**
 * 从行 strip 中选出「未缩放对齐」的原始候选帧（等宽 slot 或连通组件二选一）。
 * 拆出这一步是为了让 hatch-pet-pipeline 能在真正对齐前先跨行测量身体尺度
 * （见 computeRowBodyReference / computeCanonicalBodyScale），
 * 避免每行各自算 scale 导致 idle/running 忽大忽小。
 */
export function selectStripRawFrames(slot: RowSlot, cell: CellSpec): RawImage[] {
  let strip = decodePng(slot.stripPng);
  strip = applyStripChromaPipeline(strip, slot);

  const preferComponent = !stripMatchesEqualSlotLayout(
    strip,
    slot.frameCount,
    cell
  );
  if (preferComponent) {
    const componentFrames = extractComponentRawFrames(strip, slot.frameCount);
    if (componentFrames) return componentFrames;
  }

  const slotRawFrames = extractEqualSlotRawFrames(strip, slot);
  const slotUsable =
    slotRawFrames.length === slot.frameCount &&
    slotRawFrames.every((f) => countOpaquePixels(f) > 24) &&
    !rowFramesLookSlotSplit(slotRawFrames);
  if (slotUsable) {
    return slotRawFrames;
  }

  const componentFrames = extractComponentRawFrames(strip, slot.frameCount);
  if (componentFrames) return componentFrames;

  return slotRawFrames;
}

/** 全身判定的最小 bbox 高宽比；半身/胸像通常 <1，直立全身通常 >=1.1。 */
export const MIN_FULL_BODY_ASPECT = 1.05;

export interface RowBodyReference {
  /** 该行（净化+裁边后）内容的最大高度，用于跨行统一 scale 的锚点。 */
  maxContentH: number;
  /** 该行内容高度中位数；用于抵抗单帧夸张动作并归一化不同生图尺度。 */
  medianContentH: number;
  /** 该行内容的最大宽度。 */
  maxW: number;
  /** 参与测量的帧里，判定为「全身」的比例（0..1）。 */
  fullBodyFrameRatio: number;
  /** 参与测量的帧数（去掉完全空白帧）。 */
  measuredFrameCount: number;
}

/**
 * 测量一行「净化后原始帧」（selectStripRawFrames 的输出）的身体尺度指标。
 * 内部会先做 purifyFrameSilhouette + cropOpaqueBounds（与 alignRowFramesToCell 的
 * prepared 步骤一致），确保测量口径和实际对齐时一致。
 */
export function computeRowBodyReference(
  rawFrames: RawImage[],
  opts?: { padding?: number; minFullBodyAspect?: number }
): RowBodyReference {
  const padding = opts?.padding ?? 8;
  const minAspect = opts?.minFullBodyAspect ?? MIN_FULL_BODY_ASPECT;
  let maxContentH = 1;
  let maxW = 1;
  const contentHeights: number[] = [];
  let fullBodyCount = 0;
  let measured = 0;
  for (const raw of rawFrames) {
    const frame = cropOpaqueBounds(purifyFrameSilhouette(raw), padding);
    const bbox = measureOpaqueBBox(frame);
    if (!bbox) continue;
    measured += 1;
    const h = bbox.maxY - bbox.minY + 1;
    const w = bbox.maxX - bbox.minX + 1;
    maxContentH = Math.max(maxContentH, h);
    contentHeights.push(h);
    maxW = Math.max(maxW, Math.max(w, frame.width));
    if (h / Math.max(1, w) >= minAspect) fullBodyCount += 1;
  }
  return {
    maxContentH,
    medianContentH: Math.max(1, median(contentHeights)),
    maxW,
    fullBodyFrameRatio: measured > 0 ? fullBodyCount / measured : 0,
    measuredFrameCount: measured
  };
}

/**
 * 跨行统一 scale：以「看起来像全身」的行为准（fullBodyFrameRatio >= 0.5），
 * 取这些行里最大的内容高宽作为锚点；如果一行都不合格（极端情况），才退回全部行。
 * 这样某一行意外裁出半身/胸像时，不会把错误的小尺度污染到其它正常行。
 */
export function computeCanonicalBodyScale(
  refs: RowBodyReference[],
  cell: CellSpec,
  opts?: { safeMargin?: number; horizMargin?: number }
): number {
  const safeMargin = opts?.safeMargin ?? 12;
  const horizMargin = opts?.horizMargin ?? 4;
  const innerH = Math.max(1, cell.height - safeMargin * 2);
  const plausible = refs.filter((r) => r.fullBodyFrameRatio >= 0.5);
  const source = plausible.length > 0 ? plausible : refs;
  const maxContentH = Math.max(1, ...source.map((r) => r.maxContentH));
  const maxW = Math.max(1, ...source.map((r) => r.maxW));
  return Math.max(
    0.05,
    Math.min((cell.width - horizMargin * 2) / maxW, innerH / maxContentH)
  );
}

/**
 * 为每一行分别计算归一化倍率。
 *
 * 生图模型会把同一个角色在不同动作 strip 中画成不同的源像素尺寸，因此“所有行
 * 共用同一个倍率”并不能得到相同的可见人物大小。这里把每行的中位内容高度归一到
 * cell 的可用高度；最终的水平越界保护仍由 alignRowFramesToCell 负责。
 */
export function computeCanonicalRowScales(
  refs: RowBodyReference[],
  cell: CellSpec,
  opts?: { safeMargin?: number; horizMargin?: number; targetFillRatio?: number }
): number[] {
  const safeMargin = opts?.safeMargin ?? 12;
  const horizMargin = opts?.horizMargin ?? 4;
  const targetFillRatio = opts?.targetFillRatio ?? 1;
  const innerH = Math.max(1, cell.height - safeMargin * 2);
  const targetContentH = innerH * Math.max(0.5, Math.min(1, targetFillRatio));
  return refs.map((ref) =>
    Math.max(
      0.05,
      Math.min(
        targetContentH / Math.max(1, ref.medianContentH),
        (cell.width - horizMargin * 2) / Math.max(1, ref.maxW)
      )
    )
  );
}

/** 等宽 slot 切缝内缩：方图/密排 strip 需要更大 inset 才能隔离邻帧。 */
function resolveSlotInset(slotWidth: number, override?: number): number {
  if (override != null) return override;
  return Math.max(3, Math.min(10, Math.floor(slotWidth * 0.022)));
}

/**
 * 判断 strip 是否接近 hatch 约定的 (cell.w × N) × cell.h 布局。
 * 1024×1024 方图等不匹配尺寸时应优先走连通块裁帧。
 */
export function stripMatchesEqualSlotLayout(
  strip: RawImage,
  frameCount: number,
  cell: CellSpec
): boolean {
  const expectedW = cell.width * frameCount;
  const expectedH = cell.height;
  const wTol = Math.max(16, expectedW * 0.12);
  const hTol = Math.max(8, expectedH * 0.12);
  if (Math.abs(strip.width - expectedW) > wTol) return false;
  if (Math.abs(strip.height - expectedH) > hTol) return false;
  return !slotBoundariesHeavilyContaminated(strip, frameCount);
}

function slotBoundariesHeavilyContaminated(
  strip: RawImage,
  frameCount: number
): boolean {
  if (frameCount <= 1) return false;
  const slotW = strip.width / frameCount;
  let bad = 0;
  for (let i = 1; i < frameCount; i += 1) {
    const bx = Math.round(i * slotW);
    let hits = 0;
    for (let y = 0; y < strip.height; y += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = bx + dx;
        if (x < 0 || x >= strip.width) continue;
        if (isOpaquePixel(strip, x, y)) hits += 1;
      }
    }
    if (hits > strip.height * 5) bad += 1;
  }
  return bad >= Math.max(1, Math.floor(frameCount / 3));
}

/** 等宽 slot 切分 + 净化 silhouette（优先路径，仅用于 layout 匹配的 strip）。 */
function extractEqualSlotRawFrames(
  strip: RawImage,
  slot: RowSlot
): RawImage[] {
  const slotWidth = strip.width / slot.frameCount;
  const inset = resolveSlotInset(slotWidth, slot.slotInset);
  const frames: RawImage[] = [];
  for (let i = 0; i < slot.frameCount; i += 1) {
    let left = Math.round(i * slotWidth);
    let right = Math.round((i + 1) * slotWidth);
    if (i > 0) left += inset;
    if (i < slot.frameCount - 1) right -= inset;
    const width = Math.max(1, right - left);
    let frame = extract(strip, left, 0, width, strip.height);
    frame = purifyFrameSilhouette(frame);
    frames.push(frame);
  }
  return frames;
}

/** 等宽切分后若左右半身严重失衡，说明 slot 切到了邻帧。 */
function rowFramesLookSlotSplit(frames: RawImage[]): boolean {
  for (const frame of frames) {
    const bbox = measureOpaqueBBox(frame);
    if (!bbox) continue;
    const bodyW = bbox.maxX - bbox.minX + 1;
    if (bodyW < frame.width * 0.45) continue;
    const half = Math.floor(frame.width / 2);
    let left = 0;
    let right = 0;
    for (let y = bbox.minY; y <= bbox.maxY; y += 1) {
      for (let x = bbox.minX; x <= bbox.maxX; x += 1) {
        if (!isOpaquePixel(frame, x, y)) continue;
        if (x < half) left += 1;
        else right += 1;
      }
    }
    const balance = Math.min(left, right) / Math.max(1, Math.max(left, right));
    if (balance < 0.32) return true;
  }
  return false;
}

function isOpaquePixel(img: RawImage, x: number, y: number): boolean {
  return (img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0;
}

interface OpaqueBBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function measureOpaqueBBox(frame: RawImage): OpaqueBBox | null {
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (!isOpaquePixel(frame, x, y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, maxX, minY, maxY };
}

/** 只保留最大连通块，并去掉贴边的细长 bleed 条。 */
function purifyFrameSilhouette(frame: RawImage): RawImage {
  let purified = maskToLargestComponent(frame);
  purified = removeEdgeSliverComponents(purified);
  purified = keepDominantComponent(purified);
  return cropOpaqueBounds(purified, 4);
}

function maskToLargestComponent(frame: RawImage): RawImage {
  const components = findConnectedComponents(frame, {
    minOpaquePixels: Math.max(8, Math.floor(frame.width * frame.height * 0.0005)),
    minWidth: 2,
    minHeight: 2
  });
  if (components.length <= 1) return frame;
  const best = components.slice().sort((a, b) => b.opaquePixels - a.opaquePixels)[0];
  if (!best) return frame;
  const seedX = Math.floor((best.x0 + best.x1) / 2);
  const seedY = Math.floor((best.y0 + best.y1) / 2);
  let sx = seedX;
  let sy = seedY;
  if (!isOpaquePixel(frame, sx, sy)) {
    outer: for (let y = best.y0; y <= best.y1; y += 1) {
      for (let x = best.x0; x <= best.x1; x += 1) {
        if (isOpaquePixel(frame, x, y)) {
          sx = x;
          sy = y;
          break outer;
        }
      }
    }
  }
  const out = blankImage(frame.width, frame.height);
  const reachable = new Uint8Array(frame.width * frame.height);
  floodOpaque(frame, sx, sy, reachable);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (!reachable[y * frame.width + x]) continue;
      const src = (y * frame.width + x) * 4;
      const dst = src;
      out.data[dst] = frame.data[src] ?? 0;
      out.data[dst + 1] = frame.data[src + 1] ?? 0;
      out.data[dst + 2] = frame.data[src + 2] ?? 0;
      out.data[dst + 3] = frame.data[src + 3] ?? 0;
    }
  }
  return out;
}

function removeEdgeSliverComponents(frame: RawImage): RawImage {
  const components = findConnectedComponents(frame, {
    minOpaquePixels: 4,
    minWidth: 1,
    minHeight: 4
  });
  if (components.length <= 1) return frame;
  const largest = Math.max(...components.map((c) => c.opaquePixels));
  const { width, height, data } = frame;
  for (const c of components) {
    const w = c.x1 - c.x0 + 1;
    const h = c.y1 - c.y0 + 1;
    const touchesEdge = c.x0 <= 0 || c.x1 >= width - 1;
    if (
      !touchesEdge ||
      w > 5 ||
      h < 6 ||
      c.opaquePixels >= largest * 0.2
    ) {
      continue;
    }
    for (let y = c.y0; y <= c.y1; y += 1) {
      for (let x = c.x0; x <= c.x1; x += 1) {
        if (!isOpaquePixel(frame, x, y)) continue;
        const idx = (y * width + x) * 4;
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
  return frame;
}

/** 把「未缩放原始帧」对齐、缩放、粘贴进 cell，产出最终 ExtractedFrame[]。 */
export function finalizeAlignedFrames(
  rawFrames: RawImage[],
  cell: CellSpec,
  alignOpts: RowAlignOptions
): ExtractedFrame[] {
  const aligned = alignRowFramesToCell(rawFrames, cell, alignOpts);
  return aligned.map((frame, index) => ({
    index,
    png: encodePng(frame),
    opaquePixelCount: countOpaquePixels(frame)
  }));
}

/**
 * 组件级裁帧：真实 image model 很难严格输出 (192×N)×208 strip。
 * 它常在 1024×1024 方图里画出 N 个独立小人，且小人可能跨越等宽 slot 边界。
 *
 * 这里先用「非透明列投影」找出独立角色块，再按 x 坐标排序取前 frameCount 个。
 * 如果找不到足够块，才回退到等宽 slot 裁切。
 */
function extractComponentRawFrames(
  strip: RawImage,
  frameCount: number
): RawImage[] | null {
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

  const rawFrames = buildCandidateFrames(strip, source, frameCount);
  if (rawFrames.length === 0) return null;
  return rawFrames;
}

function buildCandidateFrames(
  strip: RawImage,
  source: OpaqueRange[],
  frameCount: number
): RawImage[] {
  const pickedComponents = source
    .slice()
    .sort((a, b) => b.opaquePixels - a.opaquePixels)
    .slice(0, Math.min(frameCount, source.length))
    .sort((a, b) => a.x0 - b.x0);

  const frames = pickedComponents.map((range) =>
    extract(
      strip,
      range.x0,
      range.y0,
      range.x1 - range.x0 + 1,
      range.y1 - range.y0 + 1
    )
  );
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
 * 行级共享锚点对齐：全行同一 scale，脚中心锁到 cell 中线，站立行脚底锁到底边安全区。
 *
 * scale 按上下双安全边距计算，避免脚底对齐时削顶；水平锚点用脚中心而非 bbox 中心，
 * 避免挥手时手臂外伸导致 centroid 漂移。
 */
export function alignRowFramesToCell(
  rawFrames: RawImage[],
  cell: CellSpec,
  opts?: RowAlignOptions
): RawImage[] {
  if (rawFrames.length === 0) return [];
  const padding = opts?.bboxPadding ?? 8;
  const safeMargin = opts?.safeMargin ?? 12;
  const horizMargin = 4;
  const alignMode = opts?.alignMode ?? "standing";

  const prepared = rawFrames.map((raw) => {
    let frame = purifyFrameSilhouette(raw);
    frame = cropOpaqueBounds(frame, padding);
    return frame;
  });

  let maxW = 1;
  let maxH = 1;
  let maxContentH = 1;
  for (const frame of prepared) {
    maxW = Math.max(maxW, frame.width);
    maxH = Math.max(maxH, frame.height);
    const bbox = measureOpaqueBBox(frame);
    if (bbox) {
      maxContentH = Math.max(maxContentH, bbox.maxY - bbox.minY + 1);
    }
  }

  const innerTop = safeMargin;
  const innerBottom = cell.height - safeMargin;
  const innerH = Math.max(1, innerBottom - innerTop);
  const targetFootCenterX = cell.width / 2;
  let scale =
    opts?.forcedScale ??
    Math.min((cell.width - horizMargin * 2) / maxW, innerH / maxContentH);

  for (const frame of prepared) {
    const bbox = measureOpaqueBBox(frame);
    if (!bbox) continue;
    const footX = measureFootCenterX(frame);
    const relLeft = bbox.minX - footX;
    const relRight = bbox.maxX - footX;
    if (relLeft < 0) {
      const bound = (targetFootCenterX - horizMargin) / -relLeft;
      if (bound > 0) scale = Math.min(scale, bound);
    }
    if (relRight > 0) {
      const bound = (cell.width - horizMargin - targetFootCenterX) / relRight;
      if (bound > 0) scale = Math.min(scale, bound);
    }
    const relTop = bbox.minY;
    const relBottom = bbox.maxY;
    const bodyH = relBottom - relTop + 1;
    const bound = innerH / bodyH;
    if (bound > 0) scale = Math.min(scale, bound);
  }
  scale = Math.max(0.05, scale);

  return prepared.map((frame) => {
    const footCenterX = measureFootCenterX(frame);
    const bbox = measureOpaqueBBox(frame);
    const w = Math.max(1, Math.round(frame.width * scale));
    const h = Math.max(1, Math.round(frame.height * scale));
    const resized = resize(frame, w, h);
    const scaledFootX = footCenterX * (w / Math.max(1, frame.width));

    let pasteX = Math.round(targetFootCenterX - scaledFootX);
    let pasteY =
      alignMode === "standing" && bbox
        ? Math.round(
            innerBottom - Math.round(((bbox.maxY + 0.5) / frame.height) * h)
          )
        : Math.floor((cell.height - h) / 2);

    pasteX = clamp(pasteX, 0, Math.max(0, cell.width - w));
    if (pasteY < innerTop) pasteY = innerTop;
    if (pasteY + h > cell.height) pasteY = Math.max(innerTop, cell.height - h);

    const out = blankImage(cell.width, cell.height);
    paste(out, resized, pasteX, pasteY);
    return normalizeTransparentRgb(defringeVerticalCellEdges(out));
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 脚底 8% 高度带内 opaque 像素的水平中心。 */
function measureFootCenterX(frame: RawImage): number {
  let maxY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if ((frame.data[(y * frame.width + x) * 4 + 3] ?? 0) === 0) continue;
      if (y > maxY) maxY = y;
    }
  }
  if (maxY < 0) return frame.width / 2;

  const bandTop = Math.max(0, maxY - Math.max(2, Math.floor(frame.height * 0.08)));
  let sumX = 0;
  let count = 0;
  for (let y = bandTop; y <= maxY; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if ((frame.data[(y * frame.width + x) * 4 + 3] ?? 0) === 0) continue;
      sumX += x;
      count += 1;
    }
  }
  return count > 0 ? sumX / count : frame.width / 2;
}

/**
 * 清除 cell 左右缘孤立竖条（slot 切缝残留 / atlas 邻格 bleed）。
 * 从脚底种子 BFS，移除外缘不可达像素；再按列高度兜底清除细边柱。
 */
function defringeVerticalCellEdges(frame: RawImage): RawImage {
  const { width, height, data } = frame;
  const reachable = computeReachableFromFoot(frame);
  const edgeDepth = Math.min(4, Math.max(2, Math.floor(width * 0.025)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= edgeDepth && x < width - edgeDepth) continue;
      const idx = (y * width + x) * 4;
      if ((data[idx + 3] ?? 0) === 0) continue;
      if (reachable[y * width + x]) continue;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0;
    }
  }

  const maxCol = Math.max(4, Math.floor(height * 0.12));
  for (const edgeX of [0, width - 1]) {
    let colCount = 0;
    for (let y = 0; y < height; y += 1) {
      if ((data[(y * width + edgeX) * 4 + 3] ?? 0) > 0) colCount += 1;
    }
    if (colCount > 0 && colCount <= maxCol) {
      for (let y = 0; y < height; y += 1) {
        const idx = (y * width + edgeX) * 4;
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }
  return frame;
}

function computeReachableFromFoot(frame: RawImage): Uint8Array {
  const { width, height } = frame;
  const reachable = new Uint8Array(width * height);
  const bbox = measureOpaqueBBox(frame);
  if (!bbox) return reachable;

  const footX = Math.round(measureFootCenterX(frame));
  const seedY = bbox.maxY;
  const seedX = clamp(footX, bbox.minX, bbox.maxX);
  if (!isOpaquePixel(frame, seedX, seedY)) {
    for (let y = bbox.maxY; y >= bbox.minY; y -= 1) {
      if (isOpaquePixel(frame, seedX, y)) {
        floodOpaque(frame, seedX, y, reachable);
        return reachable;
      }
    }
    return reachable;
  }
  floodOpaque(frame, seedX, seedY, reachable);
  return reachable;
}

function floodOpaque(
  frame: RawImage,
  seedX: number,
  seedY: number,
  reachable: Uint8Array
): void {
  const { width, height } = frame;
  const queueX = [seedX];
  const queueY = [seedY];
  let head = 0;
  reachable[seedY * width + seedX] = 1;
  while (head < queueX.length) {
    const x = queueX[head]!;
    const y = queueY[head]!;
    head += 1;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const idx = ny * width + nx;
      if (reachable[idx] || !isOpaquePixel(frame, nx, ny)) continue;
      reachable[idx] = 1;
      queueX.push(nx);
      queueY.push(ny);
    }
  }
}

interface FrameAnchorMetrics {
  centroidX: number;
  footCenterX: number;
  headTopY: number;
  footY: number;
  borderOpaque: number;
}

/** 测量单帧锚点指标，供 validateAtlas / 回归测试使用。 */
export function measureFrameAnchor(frame: RawImage): FrameAnchorMetrics | null {
  let sumX = 0;
  let count = 0;
  let minY = frame.height;
  let maxY = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const a = frame.data[(y * frame.width + x) * 4 + 3] ?? 0;
      if (a === 0) continue;
      sumX += x;
      count += 1;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (count === 0) return null;
  return {
    centroidX: sumX / count,
    footCenterX: measureFootCenterX(frame),
    headTopY: minY,
    footY: maxY,
    borderOpaque: countBorderOpaquePixels(frame, 1)
  };
}

function countBorderOpaquePixels(frame: RawImage, borderWidth: number): number {
  const { width, height, data } = frame;
  let count = 0;
  const isOpaque = (x: number, y: number): boolean =>
    (data[(y * width + x) * 4 + 3] ?? 0) > 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onBorder =
        x < borderWidth ||
        y < borderWidth ||
        x >= width - borderWidth ||
        y >= height - borderWidth;
      if (onBorder && isOpaque(x, y)) count += 1;
    }
  }
  return count;
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
  /**
   * 存在「关键失败」（空白帧 / 半身裁切 / 与其它行尺度突变）的行索引。
   * 调用方（hatch-pet-pipeline）应把这些行并入 failedRows，走一次重试而不是静默交付。
   */
  failedRowIndices: number[];
}

export interface AtlasValidationInput {
  atlasPng: Buffer;
  cell: CellSpec;
  grid: GridSpec;
  /** 每行实际使用的帧数（≤ grid.columns）。键为 rowIndex。 */
  rowFrameCounts: Record<number, number>;
  /** 行索引 → hatch 行状态；用于站立行 foot Y 稳定性校验。 */
  rowStates?: Record<number, string>;
  /** 最少非透明像素数（防 sprite 完全空白 / 几乎全透明）。默认 cell.w × cell.h × 0.04。 */
  minOpaquePerFrame?: number;
  /** 单帧允许的最大内部透明洞像素数。默认 cell.w × cell.h × 0.001。 */
  maxInteriorTransparentPixels?: number;
  /** 行内 centroid X 极差上限；默认 2px。 */
  maxCentroidXRange?: number;
  /** 站立行 foot Y 极差上限；默认 2px。 */
  maxFootYRange?: number;
  /** 单帧外圈 1px 允许的不透明像素数；默认 12。 */
  maxBorderOpaquePerFrame?: number;
  /** 全身判定最小高宽比；默认 MIN_FULL_BODY_ASPECT（1.05）。 */
  minFullBodyAspect?: number;
  /** 一行里判定为「半身/裁切」需要的非全身帧比例阈值；默认 0.5（过半非全身即判失败）。 */
  maxHalfBodyFrameRatio?: number;
  /** 跨行内容高度相对全局中位数的最大偏差比例；默认 0.35（超出 ±35% 视为尺度突变）。 */
  maxScaleJumpRatio?: number;
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
  const maxInteriorHoles =
    input.maxInteriorTransparentPixels ??
    Math.max(1, Math.floor(cell.width * cell.height * 0.002));
  const maxCentroidXRange = input.maxCentroidXRange ?? 2;
  const maxFootYRange = input.maxFootYRange ?? 2;
  const maxBorderOpaque =
    input.maxBorderOpaquePerFrame ?? 12;
  const minFullBodyAspect = input.minFullBodyAspect ?? MIN_FULL_BODY_ASPECT;
  const maxHalfBodyFrameRatio = input.maxHalfBodyFrameRatio ?? 0.5;
  const maxScaleJumpRatio = input.maxScaleJumpRatio ?? 0.35;
  const rowPixelCounts: AtlasValidationReport["rowPixelCounts"] = [];
  let trailingTransparent = true;
  const failedRowIndices = new Set<number>();
  /** 每行内容高度的中位数，用于跨行尺度突变检测（idle 与 running 忽大忽小）。 */
  const rowMedianContentHeights: Array<{ row: number; median: number }> = [];

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
    const footCenterXs: number[] = [];
    const footYs: number[] = [];
    const headTopYs: number[] = [];
    const contentHeights: number[] = [];
    let halfBodyFrames = 0;
    let measuredFrames = 0;
    const safeMargin = 12;
    for (let col = 0; col < grid.columns; col += 1) {
      const frame = extract(img, col * cell.width, row * cell.height, cell.width, cell.height);
      const count = countOpaquePixels(frame);
      if (col < frameCount) {
        perFrame.push(count);
        if (count < minOpaque) {
          issues.push(
            `row ${row} frame ${col} 不透明像素 ${count} < min ${minOpaque}，可能是空白帧`
          );
          failedRowIndices.add(row);
        }
        const interiorHoles = countInteriorTransparentPixels(frame);
        if (interiorHoles > maxInteriorHoles) {
          issues.push(
            `row ${row} frame ${col} 内部透明洞 ${interiorHoles} > max ${maxInteriorHoles}`
          );
        }
        const anchor = measureFrameAnchor(frame);
        if (anchor) {
          footCenterXs.push(anchor.footCenterX);
          footYs.push(anchor.footY);
          headTopYs.push(anchor.headTopY);
          if (anchor.borderOpaque > maxBorderOpaque) {
            issues.push(
              `row ${row} frame ${col} 外圈 1px 不透明 ${anchor.borderOpaque} > max ${maxBorderOpaque}，可能有 slot bleed`
            );
          }
          if (anchor.headTopY < safeMargin - 2) {
            issues.push(
              `row ${row} frame ${col} 头顶 Y=${anchor.headTopY} < ${safeMargin - 2}，可能被削顶`
            );
          }
          const bbox = measureOpaqueBBox(frame);
          if (bbox) {
            if (bbox.minX < 2) {
              issues.push(
                `row ${row} frame ${col} 主体左缘 X=${bbox.minX} < 2，可能被裁切或 slot bleed`
              );
            }
            if (bbox.maxX > cell.width - 3) {
              issues.push(
                `row ${row} frame ${col} 主体右缘 X=${bbox.maxX} > ${cell.width - 3}，可能被裁切`
              );
            }
            const bboxH = bbox.maxY - bbox.minY + 1;
            const bboxW = bbox.maxX - bbox.minX + 1;
            measuredFrames += 1;
            contentHeights.push(bboxH);
            if (bboxH / Math.max(1, bboxW) < minFullBodyAspect) {
              halfBodyFrames += 1;
            }
          }
        }
      } else if (count > 0) {
        trailingTransparent = false;
        issues.push(
          `row ${row} col ${col}（超过 frameCount=${frameCount}）残留 ${count} 不透明像素`
        );
      }
    }
    if (measuredFrames > 0 && halfBodyFrames / measuredFrames > 1 - maxHalfBodyFrameRatio) {
      issues.push(
        `row ${row} ${halfBodyFrames}/${measuredFrames} 帧高宽比 < ${minFullBodyAspect}，疑似半身/胸像裁切`
      );
      failedRowIndices.add(row);
    }
    if (contentHeights.length > 0) {
      rowMedianContentHeights.push({ row, median: median(contentHeights) });
    }
    if (footCenterXs.length >= 2) {
      const footCxRange = Math.max(...footCenterXs) - Math.min(...footCenterXs);
      const rowState = input.rowStates?.[row];
      const standingRow =
        rowState == null || resolveRowAlignMode(rowState) === "standing";
      const maxFootCxRange = standingRow ? maxCentroidXRange : maxCentroidXRange * 5;
      if (footCxRange > maxFootCxRange) {
        issues.push(
          `row ${row} footCenter X 极差 ${footCxRange.toFixed(1)} > max ${maxFootCxRange}，动画可能左右漂移`
        );
      }
    }
    const rowState = input.rowStates?.[row];
    const standingRow =
      rowState == null || resolveRowAlignMode(rowState) === "standing";
    if (standingRow && footYs.length >= 2) {
      const footRange = Math.max(...footYs) - Math.min(...footYs);
      if (footRange > maxFootYRange) {
        issues.push(
          `row ${row} foot Y 极差 ${footRange.toFixed(1)} > max ${maxFootYRange}，站立动画可能上下漂移`
        );
      }
    }
    rowPixelCounts.push({ rowIndex: row, perFrame });
  }

  // 跨行尺度突变检测：idle 站立时身体高度和 running 冲刺时不应忽大忽小。
  // 用全部行内容高度中位数的「中位数」作参照，比直接取均值更抗单一异常行干扰。
  if (rowMedianContentHeights.length >= 2) {
    const overallMedian = median(rowMedianContentHeights.map((r) => r.median));
    for (const { row, median: rowMedian } of rowMedianContentHeights) {
      if (overallMedian <= 0) continue;
      const deviation = Math.abs(rowMedian - overallMedian) / overallMedian;
      if (deviation > maxScaleJumpRatio) {
        issues.push(
          `row ${row} 内容高度中位数 ${rowMedian.toFixed(1)}px 与全局中位数 ${overallMedian.toFixed(1)}px 偏差 ${(deviation * 100).toFixed(0)}% > ${(maxScaleJumpRatio * 100).toFixed(0)}%，疑似尺度突变（该行姿态与其它行大小不一致）`
        );
        failedRowIndices.add(row);
      }
    }
  }

  return {
    ok: sizeOk && trailingTransparent && issues.length === 0,
    issues,
    rowPixelCounts,
    trailingTransparent,
    sizeOk,
    failedRowIndices: [...failedRowIndices].sort((a, b) => a - b)
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : sorted[mid]!;
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
