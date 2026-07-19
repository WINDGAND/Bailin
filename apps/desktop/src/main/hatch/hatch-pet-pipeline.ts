import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import {
  DEFAULT_ATLAS_CELL,
  DEFAULT_ATLAS_GRID,
  DEFAULT_ROW_FRAME_COUNTS,
  defaultAtlasStateBindings,
  defaultAtlasStateMachine,
  HATCH_PET_ROW_STATES,
  type AppearanceSpec,
  type AtlasPet,
  type HatchPetRowState,
  type SpriteProgram
} from "@bailin/character-protocol";
import {
  buildHatchPetBasePrompt,
  buildHatchPetRowPrompt
} from "@bailin/prompts";
import {
  composeAtlas,
  computeCanonicalRowScales,
  computeRowBodyReference,
  decodePng,
  finalizeAlignedFrames,
  makeCanonicalBase,
  makeContactSheet,
  makeLayoutGuide,
  makePreviewStrip,
  mirrorStripHorizontally,
  prepareHatchPetRun,
  resolveRowAlignMode,
  resolveStripChromaStrategy,
  selectStripRawFrames,
  validateAtlas,
  type AtlasValidationReport,
  type ChromaStrategy,
  type HatchJobSpec,
  type RawImage,
  type RowBodyReference,
  type RowSlot
} from "@bailin/pet-atlas-tools";
import type { LocalVault } from "../store/local-vault.js";
import {
  isModerationBlocked,
  modelSupportsTransparent,
  resolveParamMode,
  type ImageGenerationAdapter,
  type ImageGenerationResponse,
  type ImageTierName
} from "../adapters/image-generation-adapter.js";

/**
 * HatchPetPipeline：跑 hatch-pet 兼容的完整 atlas 流程。
 *
 * 1. 准备 manifest（1 base + 9 rows）
 * 2. 生成 base canonical 立绘
 * 3. 有限并发地生成 9 行 strip（running-left 可由 running-right 镜像）
 * 4. 抠 chroma → 裁帧 → 拼 atlas
 * 5. 校验 + contact sheet + preview
 * 6. 落盘到 %APPDATA%/Bailin/characters/<id>/pet/
 * 7. 返回 SpriteProgram(mode="atlas")
 *
 * 设计取舍：
 *   - atlas spritesheet 同时落盘 + 写入 data URI 到 SpriteProgram，
 *     这样桌宠窗口不依赖任何额外协议就能渲染（webSecurity 不变）。
 *   - 9 行 prompt 都把 canonical base 当 anchor 输入，确保身份一致。
 *   - 异常单行：记录 failedRows；失败行优先用已成功行的抠像帧兜底，
 *     仅在整轮无成功行时才回退未抠像 base。
 */

export interface ReferenceImageInput {
  url: string;
  source: "user-upload" | "web";
  role?: "primary" | "reference";
  notes?: string;
}

export interface HatchPipelineDeps {
  imageGen: ImageGenerationAdapter;
  vault: LocalVault;
}

export interface HatchPipelineInput {
  characterId: string;
  characterName: string;
  appearance: AppearanceSpec;
  userReferences: ReferenceImageInput[];
  /** 默认 standard；用户在 UI 选择「成本敏感」时可降到 economy。 */
  tier?: ImageTierName;
  /** 是否允许 running-left 由 running-right 镜像；默认 true，省一次生图。 */
  allowMirror?: boolean;
  /** 风格 preset。 */
  stylePreset?:
    | "auto"
    | "pixel"
    | "plush"
    | "clay"
    | "sticker"
    | "flat-vector"
    | "3d-toy"
    | "painterly";
  /** 关键事件流（QA 面板用）。 */
  onProgress?: (evt: HatchProgressEvent) => void;
  /** 9 行 strip 并发数（1–6，默认 4）。base 立绘仍串行优先生成。 */
  rowConcurrency?: number;
  signal?: AbortSignal;
}

export interface HatchPipelineResult {
  ok: boolean;
  /** 成功时一定有；失败时可能为 null（fallback 由调用方处理）。 */
  program?: SpriteProgram;
  atlas?: AtlasPet;
  validation?: AtlasValidationReport;
  totalCostUsd: number;
  durationMs: number;
  warnings: string[];
  errors: string[];
  /** 最终仍未能成功生成的姿态行（供 checkpoint / 部分重试用）。 */
  failedRows: HatchPetRowState[];
  /** 各行失败原因（若有）。 */
  failedRowReasons: Partial<Record<HatchPetRowState, string>>;
}

type RowResultEntry = { png?: Buffer; failed?: string; cost?: number };

interface GenerationCostContext {
  runningCost: { value: number };
  estimatedCost: number;
  warnings: string[];
  costCapExceeded(): boolean;
}

interface FinalizeArgs {
  input: HatchPipelineInput;
  tier: ImageTierName;
  chroma: { r: number; g: number; b: number };
  useTransparent: boolean;
  basePng: Buffer;
  rowResults: Record<HatchPetRowState, RowResultEntry>;
  frameCounts: Record<HatchPetRowState, number>;
  cell: { width: number; height: number };
  grid: { columns: number; rows: number };
  totalCost: number;
  warnings: string[];
  errors: string[];
  runId: string;
  start: number;
  manifest: ReturnType<typeof prepareHatchPetRun>;
  /** 用于自动一次结构性重试（半身 / 跨行尺度突变）时的成本软上限判断。 */
  costCtx: GenerationCostContext;
}

export type HatchProgressEvent =
  | { kind: "start"; runId: string; jobsCount: number; estimatedCostUsd: number }
  | { kind: "job_start"; jobId: string; rowState: HatchPetRowState | "base" }
  | {
      kind: "job_done";
      jobId: string;
      rowState: HatchPetRowState | "base";
      durationMs: number;
      costUsd?: number;
    }
  | {
      kind: "job_failed";
      jobId: string;
      rowState: HatchPetRowState | "base";
      reason: string;
    }
  | { kind: "job_mirrored"; jobId: string; from: string }
  | { kind: "atlas_composed"; report: AtlasValidationReport }
  | {
      kind: "qa_ready";
      contactSheetPath: string;
      previewPath?: string;
      atlasPath: string;
    };

/**
 * 两套 chroma 方案，根据生图模型是否支持透明背景动态选：
 *   - 模型支持 transparent（gpt-image-1 系列）→ 用 #00FF00 纯绿 chroma，
 *     模型可能给 alpha 也可能给纯绿底，两种都能被 chromaRemoval 抠掉。
 *   - 模型不支持 transparent（gpt-image-2）→ 用 #FFFFFF 白色 chroma，
 *     模型几乎一定给白底，chromaRemoval 可以稳定抠掉。
 */
const CHROMA_GREEN = { r: 0, g: 255, b: 0 };
const CHROMA_WHITE = { r: 255, g: 255, b: 255 };
const DEFAULT_CHROMA = CHROMA_GREEN; // 旧字段，保留供 verify-hatch-pet 等回归用

/**
 * 始终使用绿色 chroma。模型是否支持原生透明只决定请求参数，不应决定抠图底色；
 * 白底会和白衣、白鞋及肤色抗锯齿混在一起，产生无法可靠区分的白边。
 */
export function selectHatchChromaKey(
  _supportsNativeTransparency: boolean
): { r: number; g: number; b: number } {
  return CHROMA_GREEN;
}

function buildChromaRowSlot(
  chroma: { r: number; g: number; b: number },
  partial: Omit<RowSlot, "chromaKey" | "chromaSeedThreshold" | "chromaSpillThreshold" | "chromaGreenSpill">
): RowSlot {
  const isWhite = chroma.r > 200 && chroma.g > 200 && chroma.b > 200;
  return {
    ...partial,
    chromaKey: chroma,
    chromaSeedThreshold: isWhite ? 30 : 60,
    chromaSpillThreshold: isWhite ? 40 : 75,
    chromaGreenSpill: !isWhite
  };
}

/** 9 行 strip 默认并发数；可通过 input.rowConcurrency 或 BAILIN_HATCH_ROW_CONCURRENCY 覆盖。 */
const DEFAULT_HATCH_ROW_CONCURRENCY = 4;
const MAX_HATCH_ROW_CONCURRENCY = 6;
const COST_SOFT_CAP_MULTIPLIER = 1.5;
const FALLBACK_ROW_PRIORITY: HatchPetRowState[] = ["idle", "waving", "running-right"];

function resolveHatchRowConcurrency(input?: number): number {
  const fromEnv = Number(process.env.BAILIN_HATCH_ROW_CONCURRENCY ?? process.env.NUWA_PET_HATCH_ROW_CONCURRENCY);
  const raw = input ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_HATCH_ROW_CONCURRENCY);
  return Math.max(1, Math.min(MAX_HATCH_ROW_CONCURRENCY, Math.floor(raw)));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const inflight = new Set<Promise<void>>();
  while (queue.length > 0 || inflight.size > 0) {
    while (queue.length > 0 && inflight.size < concurrency) {
      const item = queue.shift()!;
      const task = worker(item).finally(() => {
        inflight.delete(task);
      });
      inflight.add(task);
    }
    if (inflight.size > 0) {
      await Promise.race(inflight);
    }
  }
}

function pickFallbackFrame(
  rowFramesPng: Partial<Record<HatchPetRowState, Buffer[]>>
): Buffer | null {
  for (const state of FALLBACK_ROW_PRIORITY) {
    const frame = rowFramesPng[state]?.[0];
    if (frame) return frame;
  }
  for (const state of HATCH_PET_ROW_STATES) {
    const frame = rowFramesPng[state]?.[0];
    if (frame) return frame;
  }
  return null;
}

function makeCostContext(estimatedCost: number, warnings: string[]): GenerationCostContext {
  const runningCost = { value: 0 };
  return {
    runningCost,
    estimatedCost,
    warnings,
    costCapExceeded() {
      return runningCost.value > estimatedCost * COST_SOFT_CAP_MULTIPLIER;
    }
  };
}

function addCost(costCtx: GenerationCostContext, costUsd?: number): void {
  if (costUsd != null && Number.isFinite(costUsd)) {
    costCtx.runningCost.value += costUsd;
  }
}

export class HatchPetPipeline {
  constructor(private deps: HatchPipelineDeps) {}

  async run(input: HatchPipelineInput): Promise<HatchPipelineResult> {
    const start = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    const runId = ulid();
    const tier: ImageTierName = input.tier ?? "standard";
    const cell = { ...DEFAULT_ATLAS_CELL };
    const grid = { ...DEFAULT_ATLAS_GRID };
    const frameCounts = { ...DEFAULT_ROW_FRAME_COUNTS };
    const allowMirror = input.allowMirror ?? true;

    const cap = this.deps.imageGen.detectCapability();
    if (!cap.ok) {
      errors.push(`生图能力未就绪：${cap.reason}`);
      return {
        ok: false,
        totalCostUsd: 0,
        durationMs: Date.now() - start,
        warnings,
        errors,
        failedRows: [],
        failedRowReasons: {}
      };
    }
    // 关键决策：根据本次生图模型是否支持透明背景，选择整轮的 chroma key 策略。
    // gpt-image-1 支持透明 → 用绿色 chroma，模型给透明也能兼容。
    // 这个决策对 base/row 所有调用统一生效，确保拼 atlas 时不会一半白底一半绿底。
    const imgCfg = this.deps.imageGen.getConfig();
    const tierCfg = imgCfg?.tiers?.[tier];
    const useTransparent = tierCfg ? modelSupportsTransparent(tierCfg.model) : true;
    const chroma = selectHatchChromaKey(useTransparent);
    if (!useTransparent) {
      warnings.push(
        `生图模型 ${tierCfg?.model ?? "?"} 不支持原生透明背景，已使用纯绿 chroma 后处理抠像。`
      );
    }

    const manifest = prepareHatchPetRun({
      runId,
      cell,
      grid,
      frameCounts,
      userReferenceCount: input.userReferences.length,
      allowMirrorRunningLeft: allowMirror,
      estimatedCostPerImageUsd: 0.05
    });

    const totalJobsCount = manifest.jobs.filter((j: HatchJobSpec) => !j.mirrorableFrom).length;
    const estimatedCost = totalJobsCount * 0.05;
    const costCtx = makeCostContext(estimatedCost, warnings);
    input.onProgress?.({
      kind: "start",
      runId,
      jobsCount: totalJobsCount,
      estimatedCostUsd: estimatedCost
    });

    // ===== Step 1: base 立绘 =====
    if (input.signal?.aborted) return abortResult(start);
    let basePng: Buffer;
    let baseCost = 0;
    try {
      const { png, costUsd } = await this.generateBase(
        input,
        tier,
        chroma,
        useTransparent,
        costCtx
      );
      basePng = makeCanonicalBase({ imagePng: png, cell });
      baseCost = costUsd ?? 0;
      addCost(costCtx, baseCost);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`base 生成失败：${msg}`);
      input.onProgress?.({
        kind: "job_failed",
        jobId: "base",
        rowState: "base",
        reason: msg
      });
      return {
        ok: false,
        totalCostUsd: baseCost,
        durationMs: Date.now() - start,
        warnings,
        errors,
        failedRows: [...HATCH_PET_ROW_STATES],
        failedRowReasons: {}
      };
    }
    let totalCost = baseCost;

    // ===== Step 2: 9 行 strip（有限并发） =====
    const rowConcurrency = resolveHatchRowConcurrency(input.rowConcurrency);
    const rowResults = {} as Record<HatchPetRowState, RowResultEntry>;

    const generateOneRow = async (rowState: HatchPetRowState): Promise<void> => {
      if (input.signal?.aborted) return;
      const t0 = Date.now();
      input.onProgress?.({
        kind: "job_start",
        jobId: `row-${rowState}`,
        rowState
      });
      try {
        const result = await this.generateRow(
          rowState,
          frameCounts[rowState],
          cell,
          basePng,
          input,
          tier,
          chroma,
          useTransparent,
          costCtx
        );
        rowResults[rowState] = { png: result.png, cost: result.costUsd };
        addCost(costCtx, result.costUsd);
        input.onProgress?.({
          kind: "job_done",
          jobId: `row-${rowState}`,
          rowState,
          durationMs: Date.now() - t0,
          costUsd: result.costUsd
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        rowResults[rowState] = { failed: msg };
        warnings.push(`row-${rowState} 生成失败：${msg}`);
        input.onProgress?.({
          kind: "job_failed",
          jobId: `row-${rowState}`,
          rowState,
          reason: msg
        });
      }
    };

    const rowsToGenerate = HATCH_PET_ROW_STATES.filter(
      (rowState) => !(rowState === "running-left" && allowMirror)
    );
    await runWithConcurrency(rowsToGenerate, rowConcurrency, generateOneRow);

    if (input.signal?.aborted) return abortResult(start);

    // running-left：优先镜像 running-right，失败再单独生图
    if (allowMirror && rowResults["running-right"]?.png) {
      try {
        const mirroredPng = mirrorStripHorizontally({
          stripPng: rowResults["running-right"].png!,
          frameCount: frameCounts["running-right"],
          cell
        });
        rowResults["running-left"] = { png: mirroredPng };
        input.onProgress?.({
          kind: "job_mirrored",
          jobId: "row-running-left",
          from: "row-running-right"
        });
      } catch (e) {
        warnings.push(
          `running-left 镜像失败：${e instanceof Error ? e.message : String(e)}，将回退到独立生成`
        );
        await generateOneRow("running-left");
      }
    } else if (!rowResults["running-left"]?.png && !rowResults["running-left"]?.failed) {
      await generateOneRow("running-left");
    }

    for (const rowState of HATCH_PET_ROW_STATES) {
      totalCost += rowResults[rowState]?.cost ?? 0;
    }

    if (input.signal?.aborted) return abortResult(start);

    return this.finalizeAndPersist({
      input,
      tier,
      chroma,
      useTransparent,
      basePng,
      rowResults,
      frameCounts,
      cell,
      grid,
      totalCost,
      warnings,
      errors,
      runId,
      start,
      manifest,
      costCtx
    });
  }

  /**
   * 仅重试指定姿态行：复用已落盘的 base 与成功行 raw strip，覆盖写 atlas。
   */
  async retryRows(
    input: HatchPipelineInput,
    rowsToRetry: HatchPetRowState[]
  ): Promise<HatchPipelineResult> {
    const start = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    const runId = ulid();
    const tier: ImageTierName = input.tier ?? "standard";
    const cell = { ...DEFAULT_ATLAS_CELL };
    const grid = { ...DEFAULT_ATLAS_GRID };
    const frameCounts = { ...DEFAULT_ROW_FRAME_COUNTS };
    const assetDir = this.deps.vault.getPetAssetDir(input.characterId);
    const basePath = join(assetDir, "canonical-base.png");

    let basePng: Buffer;
    try {
      basePng = readFileSync(basePath);
    } catch {
      return {
        ok: false,
        totalCostUsd: 0,
        durationMs: Date.now() - start,
        warnings,
        errors: ["缺少 canonical-base.png，无法部分重试"],
        failedRows: rowsToRetry,
        failedRowReasons: {}
      };
    }

    const imgCfg = this.deps.imageGen.getConfig();
    const tierCfg = imgCfg?.tiers?.[tier];
    const useTransparent = tierCfg ? modelSupportsTransparent(tierCfg.model) : true;
    const chroma = selectHatchChromaKey(useTransparent);

    const manifest = prepareHatchPetRun({
      runId,
      cell,
      grid,
      frameCounts,
      userReferenceCount: input.userReferences.length,
      allowMirrorRunningLeft: input.allowMirror ?? true,
      estimatedCostPerImageUsd: 0.05
    });
    const estimatedCost = rowsToRetry.length * 0.05;
    const costCtx = makeCostContext(estimatedCost, warnings);

    const rowResults = {} as Record<HatchPetRowState, RowResultEntry>;
    const retrySet = new Set(rowsToRetry);

    for (const rowState of HATCH_PET_ROW_STATES) {
      if (retrySet.has(rowState)) continue;
      const rawPath = join(assetDir, `raw-row-${rowState}.png`);
      try {
        rowResults[rowState] = { png: readFileSync(rawPath), cost: 0 };
      } catch {
        return {
          ok: false,
          totalCostUsd: 0,
          durationMs: Date.now() - start,
          warnings,
          errors: [`缺少 raw-row-${rowState}.png，无法部分重试`],
          failedRows: rowsToRetry,
          failedRowReasons: {}
        };
      }
    }

    let totalCost = 0;
    for (const rowState of rowsToRetry) {
      if (input.signal?.aborted) return abortResult(start);
      const t0 = Date.now();
      input.onProgress?.({
        kind: "job_start",
        jobId: `row-${rowState}`,
        rowState
      });
      try {
        const result = await this.generateRow(
          rowState,
          frameCounts[rowState],
          cell,
          basePng,
          input,
          tier,
          chroma,
          useTransparent,
          costCtx
        );
        rowResults[rowState] = { png: result.png, cost: result.costUsd };
        addCost(costCtx, result.costUsd);
        totalCost += result.costUsd ?? 0;
        input.onProgress?.({
          kind: "job_done",
          jobId: `row-${rowState}`,
          rowState,
          durationMs: Date.now() - t0,
          costUsd: result.costUsd
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        rowResults[rowState] = { failed: msg };
        warnings.push(`row-${rowState} 重试失败：${msg}`);
        input.onProgress?.({
          kind: "job_failed",
          jobId: `row-${rowState}`,
          rowState,
          reason: msg
        });
      }
    }

    return this.finalizeAndPersist({
      input,
      tier,
      chroma,
      useTransparent,
      basePng,
      rowResults,
      frameCounts,
      cell,
      grid,
      totalCost,
      warnings,
      errors,
      runId,
      start,
      manifest,
      costCtx
    });
  }

  /**
   * 从一行已生成的 strip 里提取「未缩放对齐」的原始帧。抽出来是因为跨行统一 scale
   * （computeCanonicalBodyScale）必须先看完所有行的原始尺寸，才能决定共同锚点，
   * 不能像旧实现那样逐行各自 extractStripFrames 各算各的 scale。
   */
  private extractRawRowFrames(
    rowState: HatchPetRowState,
    rowResults: Record<HatchPetRowState, RowResultEntry>,
    frameCounts: Record<HatchPetRowState, number>,
    cell: { width: number; height: number },
    chroma: { r: number; g: number; b: number },
    warnings: string[],
    onChromaStrategy: (s: ChromaStrategy) => void
  ): RawImage[] | null {
    const r = rowResults[rowState];
    if (!r?.png) return null;
    try {
      const slot = buildChromaRowSlot(chroma, {
        rowIndex: HATCH_PET_ROW_STATES.indexOf(rowState),
        frameCount: frameCounts[rowState],
        stripPng: r.png,
        rowState,
        // hatch 始终要求绿幕；即使模型顺带返回了 alpha，也可能在头发/四肢之间
        // 留下被包围的绿色孤岛，不能因“检测到透明通道”而跳过抠像。
        forceChroma: true
      });
      const stripProbe = decodePng(r.png);
      onChromaStrategy(resolveStripChromaStrategy(stripProbe, slot));
      return selectStripRawFrames(slot, cell);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`row-${rowState} 裁帧失败：${msg}`);
      return null;
    }
  }

  private async finalizeAndPersist(args: FinalizeArgs): Promise<HatchPipelineResult> {
    const {
      input,
      tier,
      chroma,
      useTransparent,
      basePng,
      rowResults,
      frameCounts,
      cell,
      grid,
      totalCost,
      warnings,
      errors,
      runId,
      start,
      manifest,
      costCtx
    } = args;

    let totalCostLocal = totalCost;
    let chromaStrategy: ChromaStrategy = useTransparent ? "green" : "white";
    const setChromaStrategy = (s: ChromaStrategy) => {
      chromaStrategy = s;
    };

    // ===== 第一步：逐行提取「未对齐原始帧」（不在这里缩放，留给下面跨行统一 scale） =====
    const rawFramesByRow: Partial<Record<HatchPetRowState, RawImage[]>> = {};
    const genFailedRows: HatchPetRowState[] = [];
    for (const rowState of HATCH_PET_ROW_STATES) {
      const raw = this.extractRawRowFrames(
        rowState,
        rowResults,
        frameCounts,
        cell,
        chroma,
        warnings,
        setChromaStrategy
      );
      if (raw) rawFramesByRow[rowState] = raw;
      else genFailedRows.push(rowState);
    }

    /**
     * 关键修复：以前是「逐行各自 extractStripFrames」，每行按自己的 maxW/maxContentH 算 scale，
     * 导致 idle 和 running 大小不一致（跑起来突然变小/变大）。这里先测量所有成功行的身体尺度，
     * 取「看起来像全身」的行为准算出统一 forcedScale，再用同一个 scale 对齐每一行。
     */
    const buildFramesAndValidate = (): {
      rowFramesPng: Record<HatchPetRowState, Buffer[]>;
      validation: AtlasValidationReport;
      atlasPng: Buffer;
    } => {
      const refsByRow = new Map<HatchPetRowState, RowBodyReference>();
      for (const rowState of HATCH_PET_ROW_STATES) {
        const raw = rawFramesByRow[rowState];
        if (raw) refsByRow.set(rowState, computeRowBodyReference(raw));
      }
      const refEntries = [...refsByRow.entries()];
      const rowScales = computeCanonicalRowScales(
        refEntries.map(([, ref]) => ref),
        cell
      );
      const forcedScaleByRow = new Map(
        refEntries.map(([rowState], index) => [rowState, rowScales[index]!])
      );

      const rowFramesPng = {} as Record<HatchPetRowState, Buffer[]>;
      for (const rowState of HATCH_PET_ROW_STATES) {
        const raw = rawFramesByRow[rowState];
        if (!raw) continue;
        const aligned = finalizeAlignedFrames(raw, cell, {
          alignMode: resolveRowAlignMode(rowState),
          safeMargin: 12,
          bboxPadding: 8,
          forcedScale: forcedScaleByRow.get(rowState)
        });
        rowFramesPng[rowState] = aligned.map((f) => f.png);
      }

      const fallbackFrame = pickFallbackFrame(rowFramesPng);
      for (const rowState of genFailedRows) {
        const count = frameCounts[rowState];
        if (fallbackFrame) {
          rowFramesPng[rowState] = Array.from({ length: count }, () => fallbackFrame);
        } else {
          rowFramesPng[rowState] = Array.from({ length: count }, () => basePng);
        }
      }

      const composeRows = HATCH_PET_ROW_STATES.map((state, idx) => ({
        rowIndex: idx,
        framesPng: rowFramesPng[state] ?? []
      }));
      const atlasPng = composeAtlas({ cell, grid, rows: composeRows });

      const rowFrameCounts: Record<number, number> = {};
      const rowStates: Record<number, string> = {};
      HATCH_PET_ROW_STATES.forEach((state, idx) => {
        rowFrameCounts[idx] = frameCounts[state];
        rowStates[idx] = state;
      });
      const validation = validateAtlas({
        atlasPng,
        cell,
        grid,
        rowFrameCounts,
        rowStates,
        minOpaquePerFrame: Math.floor(cell.width * cell.height * 0.015)
      });
      return { rowFramesPng, validation, atlasPng };
    };

    let { rowFramesPng, validation, atlasPng } = buildFramesAndValidate();
    input.onProgress?.({ kind: "atlas_composed", report: validation });

    // ===== 结构性失败一次自动重试：半身裁切 / 跨行尺度突变（不含整轮生成失败的行，那些已走兜底） =====
    const structuralFailedStates = validation.failedRowIndices
      .map((idx) => HATCH_PET_ROW_STATES[idx])
      .filter(
        (s): s is HatchPetRowState => s != null && !genFailedRows.includes(s)
      );

    if (structuralFailedStates.length > 0) {
      if (costCtx.costCapExceeded()) {
        warnings.push(
          `atlas 校验发现 ${structuralFailedStates.length} 行结构性问题（半身/尺度突变），但成本已超预估 ${COST_SOFT_CAP_MULTIPLIER} 倍，跳过自动重试`
        );
      } else {
        warnings.push(
          `atlas 校验发现 ${structuralFailedStates.length} 行结构性问题（半身/尺度突变），正在自动重试一次：${structuralFailedStates.join(", ")}`
        );
        for (const rowState of structuralFailedStates) {
          try {
            const result = await this.generateRow(
              rowState,
              frameCounts[rowState],
              cell,
              basePng,
              input,
              tier,
              chroma,
              useTransparent,
              costCtx
            );
            rowResults[rowState] = { png: result.png, cost: result.costUsd };
            addCost(costCtx, result.costUsd);
            totalCostLocal += result.costUsd ?? 0;
            const raw = this.extractRawRowFrames(
              rowState,
              rowResults,
              frameCounts,
              cell,
              chroma,
              warnings,
              setChromaStrategy
            );
            if (raw) {
              rawFramesByRow[rowState] = raw;
            } else {
              genFailedRows.push(rowState);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warnings.push(`row-${rowState} 结构性重试失败：${msg}`);
          }
        }
        ({ rowFramesPng, validation, atlasPng } = buildFramesAndValidate());
        input.onProgress?.({ kind: "atlas_composed", report: validation });
      }
    }

    const stillFailedStates = validation.failedRowIndices
      .map((idx) => HATCH_PET_ROW_STATES[idx])
      .filter((s): s is HatchPetRowState => s != null);
    const failedRows = [...new Set([...genFailedRows, ...stillFailedStates])];
    const failedRowReasons: Partial<Record<HatchPetRowState, string>> = {};
    for (const rowState of failedRows) {
      const reason = rowResults[rowState]?.failed;
      if (reason) failedRowReasons[rowState] = reason;
      else if (stillFailedStates.includes(rowState) && !genFailedRows.includes(rowState)) {
        failedRowReasons[rowState] = "atlas 校验判定为半身裁切或跨行尺度突变，自动重试后仍未通过";
      }
    }

    if (!validation.ok) {
      warnings.push(
        `atlas 校验未通过：${validation.issues.slice(0, 3).join(" | ")}`
      );
    }

    if (input.signal?.aborted) return abortResult(start);

    const contactSheet = makeContactSheet({
      rows: HATCH_PET_ROW_STATES.map((state) => ({
        label: state,
        framesPng: rowFramesPng[state] ?? []
      })),
      thumbCell: { width: Math.round(cell.width * 0.4), height: Math.round(cell.height * 0.4) },
      gap: 6
    });
    const previewStrip = makePreviewStrip({
      framesPng: rowFramesPng.idle ?? [],
      cell
    });

    const assetDir = this.deps.vault.getPetAssetDir(input.characterId);
    const atlasPath = join(assetDir, "spritesheet.png");
    const contactPath = join(assetDir, "contact-sheet.png");
    const previewPath = join(assetDir, "preview-strip.png");
    const basePath = join(assetDir, "canonical-base.png");
    const manifestPath = join(assetDir, "hatch-run.json");

    try {
      writeFileSync(atlasPath, atlasPng);
      writeFileSync(contactPath, contactSheet);
      writeFileSync(previewPath, previewStrip);
      writeFileSync(basePath, basePng);
      for (const rowState of HATCH_PET_ROW_STATES) {
        const raw = rowResults[rowState]?.png;
        if (raw) {
          writeFileSync(join(assetDir, `raw-row-${rowState}.png`), raw);
        }
      }
      writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            runId,
            tier,
            chromaStrategy,
            chromaKey: chroma,
            chromaSeedThreshold: chroma === CHROMA_WHITE ? 30 : 60,
            chromaSpillThreshold: chroma === CHROMA_WHITE ? 40 : 75,
            durationMs: Date.now() - start,
            totalCostUsd: totalCostLocal,
            failedRows,
            validation,
            manifest
          },
          null,
          2
        )
      );
    } catch (e) {
      warnings.push(
        `落盘失败（不影响显示）：${e instanceof Error ? e.message : String(e)}`
      );
    }
    input.onProgress?.({
      kind: "qa_ready",
      contactSheetPath: contactPath,
      previewPath,
      atlasPath
    });

    const stateBindings = defaultAtlasStateBindings(frameCounts);
    const atlas: AtlasPet = {
      spritesheetUrl: bufferToDataUrl(atlasPng, "image/png"),
      imageFormat: "png",
      cell,
      grid,
      states: stateBindings,
      stateMachine: defaultAtlasStateMachine(),
      contactSheetUrl: `file://${contactPath.replace(/\\/g, "/")}`,
      previewUrl: `file://${previewPath.replace(/\\/g, "/")}`,
      hatchRunId: runId,
      meta: {
        generator: "hatch-pet-pipeline-v1",
        generatedAt: Date.now(),
        modelTier: tier,
        totalCostUsd: totalCostLocal
      }
    };

    const program: SpriteProgram = {
      schemaVersion: "0.1",
      mode: "atlas",
      size: { width: cell.width, height: cell.height },
      displayScale: 1,
      palette: (input.appearance.palette ?? [
        { role: "outline", hex: "#1a1a2e" },
        { role: "skin", hex: "#f3d3b1" }
      ])
        .slice(0, 16)
        .map((p) => ({ name: p.role ?? "default", hex: p.hex })),
      atlas
    };

    // 关键修复（delivery-gate）：以前只看 sizeOk/trailingTransparent 就判定 ok=true，
    // 会把 validateAtlas 已经标为半身裁切 / 跨行尺度突变 / 空白帧的 issues 直接当成功交付。
    // 现在必须 validation.ok（issues 为空）且没有遗留 failedRows 才算真正成功；
    // 否则 program 仍会返回（供 UI 预览 + 走已有的 sprite checkpoint 重试路径），
    // 但 ok=false，调用方不能把它当无条件成功收尾。
    return {
      ok: validation.ok && failedRows.length === 0,
      program,
      atlas,
      validation,
      totalCostUsd: totalCostLocal,
      durationMs: Date.now() - start,
      warnings,
      errors,
      failedRows,
      failedRowReasons
    };
  }

  private async invokeWithModerationRetry(
    label: string,
    costCtx: GenerationCostContext,
    call: (anonymize: boolean) => Promise<ImageGenerationResponse>
  ): Promise<{ png: Buffer; costUsd?: number }> {
    const first = await call(false);
    if (first.kind === "done") {
      return { png: first.buffer, costUsd: first.estimatedCostUsd };
    }
    if (isModerationBlocked(first.message)) {
      if (costCtx.costCapExceeded()) {
        costCtx.warnings.push(
          `${label} 成本已超预估 ${COST_SOFT_CAP_MULTIPLIER} 倍，跳过自动软化重试`
        );
        throw new Error(`${first.code}: ${first.message}`);
      }
      const retry = await call(true);
      if (retry.kind === "done") {
        costCtx.warnings.push(`${label} moderation 拦截后去标识化重试成功`);
        return { png: retry.buffer, costUsd: retry.estimatedCostUsd };
      }
      throw new Error(`${retry.code}: ${retry.message}`);
    }
    throw new Error(`${first.code}: ${first.message}`);
  }

  private async generateBase(
    input: HatchPipelineInput,
    tier: ImageTierName,
    chroma: { r: number; g: number; b: number },
    transparentBackground: boolean,
    costCtx: GenerationCostContext
  ): Promise<{ png: Buffer; costUsd?: number }> {
    const userRefs = input.userReferences.slice(0, 1).map((r) => r.url);
    const label = `hatch:${input.characterName.slice(0, 16)}:base`;

    return this.invokeWithModerationRetry(
      label,
      costCtx,
      (anonymize) => {
        const prompt = buildHatchPetBasePrompt({
          characterName: input.characterName,
          appearance: input.appearance,
          userHint: undefined,
          stylePreset: input.stylePreset ?? "auto",
          chromaKey: chroma,
          anonymize
        });
        return userRefs.length > 0
          ? this.deps.imageGen.edit({
              prompt,
              images: userRefs,
              tier,
              transparentBackground,
              requestLabel: label
            })
          : this.deps.imageGen.generate({
              prompt,
              tier,
              transparentBackground,
              requestLabel: label
            });
      }
    );
  }

  private async generateRow(
    rowState: HatchPetRowState,
    frameCount: number,
    cell: { width: number; height: number },
    canonicalBasePng: Buffer,
    input: HatchPipelineInput,
    tier: ImageTierName,
    chroma: { r: number; g: number; b: number },
    transparentBackground: boolean,
    costCtx: GenerationCostContext
  ): Promise<{ png: Buffer; costUsd?: number }> {
    // 关键修复：manifest 声明了 layout-guide 输入角色，但此前从未真正生成/传入，
    // 导致 prompt 要求的横向 N 帧 strip 构图和模型实际输出的 1024×1024 方图错位，
    // 是"待机半身、奔跑全身"等构图不稳定的根因之一。这里把 layout guide 作为
    // 第二张 edit 参考图传入，只提示构图比例，不影响角色身份（身份仍靠 canonical base 锚定）。
    const layoutGuidePng = makeLayoutGuide({ frameCount, cell });
    const images: string[] = [
      bufferToDataUrl(canonicalBasePng, "image/png"),
      bufferToDataUrl(layoutGuidePng, "image/png")
    ];
    const tierCfg = this.deps.imageGen.getConfig().tiers[tier];
    const label = `hatch:${input.characterName.slice(0, 16)}:row-${rowState}`;

    return this.invokeWithModerationRetry(label, costCtx, (anonymize) => {
      const prompt = buildHatchPetRowPrompt({
        characterName: input.characterName,
        appearance: input.appearance,
        rowState,
        frameCount,
        cell,
        stylePreset: input.stylePreset ?? "auto",
        chromaKey: chroma,
        anonymize
      });
      return this.deps.imageGen.edit({
        prompt,
        images,
        tier,
        transparentBackground,
        ...(resolveParamMode(tierCfg) === "openaiImages" ? { size: "1024x1024" } : {}),
        requestLabel: label
      });
    });
  }
}

function abortResult(start: number): HatchPipelineResult {
  return {
    ok: false,
    totalCostUsd: 0,
    durationMs: Date.now() - start,
    warnings: [],
    errors: ["pipeline aborted"],
    failedRows: [],
    failedRowReasons: {}
  };
}

function bufferToDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}
