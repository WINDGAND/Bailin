import {
  HATCH_PET_ROW_STATES,
  DEFAULT_ROW_FRAME_COUNTS,
  DEFAULT_ATLAS_CELL,
  DEFAULT_ATLAS_GRID,
  type HatchPetRowState
} from "@bailin/character-protocol";
import { blankImage, encodePng, paste, resize, decodePng } from "./png.js";

/**
 * hatch-pet manifest / layout guide。
 *
 * 这里只产出「确定性」资产：要做哪些 imagegen job、每个 job 的输入图列表、
 * 行级 layout guide 的 PNG buffer。Prompt 文本由 @bailin/prompts 提供，
 * 这样不会让 atlas 工具和 LLM prompt 工程耦合。
 */

export type HatchJobId = "base" | `row-${HatchPetRowState}`;

export interface HatchJobSpec {
  id: HatchJobId;
  kind: "base" | "row";
  /** row job 才有；base job 是 null。 */
  rowState: HatchPetRowState | null;
  /** 该 job 需要的输入图来源列表。base job 可能没有；row job 至少有 canonical-base。 */
  inputs: Array<{
    role:
      | "user-reference"
      | "canonical-base"
      | "layout-guide"
      | "previous-row";
    /** 在 manifest 中以「占位符」记录；调用方负责把它解析成实际 data URI 或文件。 */
    name: string;
  }>;
  /** 期望输出尺寸（base 给立绘尺寸，row 给 strip 尺寸）。 */
  outputSize: { width: number; height: number };
  /** 该行使用的帧数（base = 1）。 */
  frameCount: number;
  /** 该 job 是否可以在 mirroring 后跳过实际生成（仅 running-left）。 */
  mirrorableFrom?: HatchJobId;
  /** 估算每张图成本（USD）；仅 UI 显示用。 */
  estimatedCostUsd?: number;
}

export interface HatchManifest {
  /** 运行 ID，便于落盘 & 重放。 */
  runId: string;
  /** atlas cell / grid 规格；默认 192×208 / 8×9。 */
  cell: { width: number; height: number };
  grid: { columns: number; rows: number };
  /** 每行使用的帧数；默认按 DEFAULT_ROW_FRAME_COUNTS。 */
  frameCounts: Record<HatchPetRowState, number>;
  /** 全部 jobs 列表。基础 + 9 行 = 10 个 jobs；其中 running-left 标 mirrorable。 */
  jobs: HatchJobSpec[];
}

export interface PrepareRunInput {
  runId: string;
  cell?: { width: number; height: number };
  grid?: { columns: number; rows: number };
  /** 可覆盖单行帧数。 */
  frameCounts?: Partial<Record<HatchPetRowState, number>>;
  /** 用户上传 / web 抓取的参考图数量；用于把它们一起塞进每个 row job 的 inputs。 */
  userReferenceCount?: number;
  /** 若 base / row 用不同档位，由 pipeline 估算成本传进来。 */
  estimatedCostPerImageUsd?: number;
  /** 是否允许 running-left 由 running-right 镜像得到。 */
  allowMirrorRunningLeft?: boolean;
}

/**
 * 生成完整 hatch-pet manifest：1 个 base job + 9 个 row job。
 * 输出 manifest 直接序列化为 hatch-run.json 落到角色 vault。
 */
export function prepareHatchPetRun(input: PrepareRunInput): HatchManifest {
  const cell = input.cell ?? { ...DEFAULT_ATLAS_CELL };
  const grid = input.grid ?? { ...DEFAULT_ATLAS_GRID };
  const frameCounts: Record<HatchPetRowState, number> = {
    ...DEFAULT_ROW_FRAME_COUNTS,
    ...input.frameCounts
  };

  const userRefs = Array.from(
    { length: input.userReferenceCount ?? 0 },
    (_, i) => ({
      role: "user-reference" as const,
      name: `user-ref-${i}`
    })
  );

  const jobs: HatchJobSpec[] = [];

  jobs.push({
    id: "base",
    kind: "base",
    rowState: null,
    inputs: userRefs,
    outputSize: { width: cell.width, height: cell.height },
    frameCount: 1,
    estimatedCostUsd: input.estimatedCostPerImageUsd
  });

  for (const rowState of HATCH_PET_ROW_STATES) {
    const frameCount = frameCounts[rowState];
    const inputs: HatchJobSpec["inputs"] = [
      { role: "canonical-base", name: "canonical-base" },
      { role: "layout-guide", name: `layout-${rowState}` },
      ...userRefs
    ];
    const mirrorable =
      input.allowMirrorRunningLeft && rowState === "running-left"
        ? ("row-running-right" as HatchJobId)
        : undefined;
    jobs.push({
      id: `row-${rowState}`,
      kind: "row",
      rowState,
      inputs,
      outputSize: {
        width: cell.width * frameCount,
        height: cell.height
      },
      frameCount,
      mirrorableFrom: mirrorable,
      estimatedCostUsd: mirrorable ? 0 : input.estimatedCostPerImageUsd
    });
  }

  return {
    runId: input.runId,
    cell,
    grid,
    frameCounts,
    jobs
  };
}

/**
 * 生成 layout guide PNG：在 strip 上画 N 等分的浅色矩形 + 中线 + 安全边，
 * 作为 imagegen 的「隐形」参考图（模型只看构图比例，不复制 guide 像素）。
 *
 * 颜色：浅灰背景 + 深灰边框，避免与桌宠主题色冲突。
 */
export function makeLayoutGuide(input: {
  frameCount: number;
  cell: { width: number; height: number };
  safeMargin?: number;
}): Buffer {
  const { frameCount, cell } = input;
  const margin = input.safeMargin ?? 12;
  const w = cell.width * frameCount;
  const h = cell.height;
  const img = blankImage(w, h);

  // 浅灰背景 (#1f2933 with low alpha)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 240;
    img.data[i + 1] = 240;
    img.data[i + 2] = 245;
    img.data[i + 3] = 255;
  }

  // 每格：浅米色填充 + 深灰边框 + 中心十字
  for (let col = 0; col < frameCount; col += 1) {
    const x0 = col * cell.width;
    const y0 = 0;
    drawRect(img, x0, y0, cell.width, h, 252, 248, 240, 255);
    drawRectOutline(img, x0, y0, cell.width, h, 60, 60, 70, 255, 2);
    drawRectOutline(
      img,
      x0 + margin,
      y0 + margin,
      cell.width - margin * 2,
      h - margin * 2,
      170,
      180,
      190,
      255,
      1
    );
    // 中心十字
    const cx = x0 + Math.floor(cell.width / 2);
    const cy = Math.floor(h / 2);
    drawRect(img, cx - 1, cy - 6, 2, 12, 170, 180, 190, 255);
    drawRect(img, cx - 6, cy - 1, 12, 2, 170, 180, 190, 255);
  }
  return encodePng(img);
}

function drawRect(
  img: ReturnType<typeof blankImage>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(img.width, x + w);
  const y1 = Math.min(img.height, y + h);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const idx = (py * img.width + px) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = a;
    }
  }
}

function drawRectOutline(
  img: ReturnType<typeof blankImage>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
  thickness: number
): void {
  drawRect(img, x, y, w, thickness, r, g, b, a);
  drawRect(img, x, y + h - thickness, w, thickness, r, g, b, a);
  drawRect(img, x, y, thickness, h, r, g, b, a);
  drawRect(img, x + w - thickness, y, thickness, h, r, g, b, a);
}

/**
 * 镜像一张 strip：把 N 帧按列翻转，再每帧 horizontal flip。
 * 用于 running-left 从 running-right 派生。
 *
 * 实现：把 strip 解码后按列从右到左拷贝，且每列再做镜像翻转，保持每帧的内部水平翻转。
 */
export function mirrorStripHorizontally(input: {
  stripPng: Buffer;
  frameCount: number;
  cell: { width: number; height: number };
}): Buffer {
  const src = decodePng(input.stripPng);
  const slotWidth = src.width / input.frameCount;
  const out = blankImage(src.width, src.height);
  for (let i = 0; i < input.frameCount; i += 1) {
    const srcX = Math.round(i * slotWidth);
    const w = Math.round((i + 1) * slotWidth) - srcX;
    const dstX = Math.round((input.frameCount - 1 - i) * slotWidth);
    // 把每帧 horizontally flip 后放进 out
    for (let y = 0; y < src.height; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const sIdx = (y * src.width + srcX + x) * 4;
        const dIdx = (y * src.width + dstX + (w - 1 - x)) * 4;
        out.data[dIdx] = src.data[sIdx] ?? 0;
        out.data[dIdx + 1] = src.data[sIdx + 1] ?? 0;
        out.data[dIdx + 2] = src.data[sIdx + 2] ?? 0;
        out.data[dIdx + 3] = src.data[sIdx + 3] ?? 0;
      }
    }
  }
  return encodePng(out);
}

/**
 * 把任意 PNG resize 到 cell 尺寸，作为 base 立绘的 canonical 资产。
 * Atlas pipeline 的 row job 都会以此为身份锚定。
 */
export function makeCanonicalBase(input: {
  imagePng: Buffer;
  cell: { width: number; height: number };
}): Buffer {
  const img = decodePng(input.imagePng);
  if (img.width === input.cell.width && img.height === input.cell.height) {
    return input.imagePng;
  }
  const resized = resize(img, input.cell.width, input.cell.height);
  // 把任何残留 RGB 在透明像素上清零，避免下游 Codex 警告
  for (let i = 3; i < resized.data.length; i += 4) {
    if ((resized.data[i] ?? 0) === 0) {
      resized.data[i - 3] = 0;
      resized.data[i - 2] = 0;
      resized.data[i - 1] = 0;
    }
  }
  // 把 resized 用一个空白底板 paste 一下，确保 data buffer 是新分配的
  const out = blankImage(input.cell.width, input.cell.height);
  paste(out, resized, 0, 0);
  return encodePng(out);
}
