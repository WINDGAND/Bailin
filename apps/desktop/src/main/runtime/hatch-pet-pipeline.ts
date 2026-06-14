import { writeFileSync } from "node:fs";
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
} from "@nuwa-pet/character-protocol";
import {
  buildHatchPetBasePrompt,
  buildHatchPetRowPrompt
} from "@nuwa-pet/nuwa-prompts";
import {
  composeAtlas,
  extractStripFrames,
  makeCanonicalBase,
  makeContactSheet,
  makeLayoutGuide,
  makePreviewStrip,
  mirrorStripHorizontally,
  prepareHatchPetRun,
  validateAtlas,
  type AtlasValidationReport
} from "@nuwa-pet/pet-atlas-tools";
import type { LocalVault } from "../store/local-vault.js";
import type {
  ImageGenerationAdapter,
  ImageTierName
} from "../adapters/image-generation-adapter.js";

/**
 * HatchPetPipeline：跑 hatch-pet 兼容的完整 atlas 流程。
 *
 * 1. 准备 manifest（1 base + 9 rows）
 * 2. 生成 base canonical 立绘
 * 3. 串行/有限并发地生成 9 行 strip（running-left 可由 running-right 镜像）
 * 4. 抠 chroma → 裁帧 → 拼 atlas
 * 5. 校验 + contact sheet + preview
 * 6. 落盘到 %APPDATA%/Bailin/characters/<id>/pet/
 * 7. 返回 SpriteProgram(mode="atlas")
 *
 * 设计取舍：
 *   - atlas spritesheet 同时落盘 + 写入 data URI 到 SpriteProgram，
 *     这样桌宠窗口不依赖任何额外协议就能渲染（webSecurity 不变）。
 *   - 9 行 prompt 都把 canonical base 当 anchor 输入，确保身份一致。
 *   - 异常单行：不阻塞整体流程；失败的行用 base + opacity 兜底，
 *     保证用户至少能看到一只「站着的」桌宠。
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

/** 默认 chroma key（鲜艳的洋红，几乎不会出现在真实角色立绘里）。 */
const DEFAULT_CHROMA = { r: 0, g: 255, b: 0 };

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
        errors
      };
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

    const totalJobsCount = manifest.jobs.filter((j) => !j.mirrorableFrom).length;
    const estimatedCost = totalJobsCount * 0.05;
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
      const { png, costUsd } = await this.generateBase(input, tier);
      basePng = makeCanonicalBase({ imagePng: png, cell });
      baseCost = costUsd ?? 0;
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
        errors
      };
    }
    let totalCost = baseCost;

    // ===== Step 2: 9 行 strip =====
    const rowResults: Record<
      HatchPetRowState,
      { png?: Buffer; failed?: string; cost?: number }
    > = {} as Record<HatchPetRowState, { png?: Buffer; failed?: string }>;

    for (const rowState of HATCH_PET_ROW_STATES) {
      if (input.signal?.aborted) return abortResult(start);

      // 如果允许 mirror 且当前是 running-left 且 running-right 已成功，直接派生
      if (
        rowState === "running-left" &&
        allowMirror &&
        rowResults["running-right"]?.png
      ) {
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
          continue;
        } catch (e) {
          warnings.push(
            `running-left 镜像失败：${e instanceof Error ? e.message : String(e)}，将回退到独立生成`
          );
        }
      }

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
          tier
        );
        rowResults[rowState] = { png: result.png, cost: result.costUsd };
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
        warnings.push(`row-${rowState} 生成失败：${msg}`);
        input.onProgress?.({
          kind: "job_failed",
          jobId: `row-${rowState}`,
          rowState,
          reason: msg
        });
      }
    }

    // ===== Step 3: 抠 chroma + 裁帧 =====
    const rowFramesPng: Record<HatchPetRowState, Buffer[]> = {} as Record<
      HatchPetRowState,
      Buffer[]
    >;
    for (const rowState of HATCH_PET_ROW_STATES) {
      const r = rowResults[rowState];
      if (!r.png) {
        // 失败行：回退为 base 重复 N 帧，保证至少有动作（虽然没有变化）
        warnings.push(`row-${rowState} 用 base 兜底为 ${frameCounts[rowState]} 帧`);
        const repeats: Buffer[] = [];
        for (let i = 0; i < frameCounts[rowState]; i += 1) repeats.push(basePng);
        rowFramesPng[rowState] = repeats;
        continue;
      }
      try {
        const frames = extractStripFrames(
          {
            rowIndex: HATCH_PET_ROW_STATES.indexOf(rowState),
            frameCount: frameCounts[rowState],
            stripPng: r.png,
            chromaKey: DEFAULT_CHROMA,
            chromaThreshold: 80
          },
          cell
        );
        rowFramesPng[rowState] = frames.map((f) => f.png);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`row-${rowState} 裁帧失败：${msg}，用 base 兜底`);
        const repeats: Buffer[] = [];
        for (let i = 0; i < frameCounts[rowState]; i += 1) repeats.push(basePng);
        rowFramesPng[rowState] = repeats;
      }
    }

    // ===== Step 4: 拼 atlas =====
    if (input.signal?.aborted) return abortResult(start);
    const composeRows = HATCH_PET_ROW_STATES.map((state, idx) => ({
      rowIndex: idx,
      framesPng: rowFramesPng[state] ?? []
    }));
    const atlasPng = composeAtlas({ cell, grid, rows: composeRows });

    // ===== Step 5: 校验 =====
    const rowFrameCounts: Record<number, number> = {};
    HATCH_PET_ROW_STATES.forEach((state, idx) => {
      rowFrameCounts[idx] = frameCounts[state];
    });
    const validation = validateAtlas({
      atlasPng,
      cell,
      grid,
      rowFrameCounts
    });
    input.onProgress?.({ kind: "atlas_composed", report: validation });
    if (!validation.ok) {
      warnings.push(
        `atlas 校验未通过：${validation.issues.slice(0, 3).join(" | ")}`
      );
    }

    // ===== Step 6: QA 资产 =====
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

    // ===== Step 7: 落盘 =====
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
      writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            runId,
            tier,
            durationMs: Date.now() - start,
            totalCostUsd: totalCost,
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

    // ===== Step 8: 组装 SpriteProgram =====
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
        totalCostUsd: totalCost
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

    return {
      ok: validation.ok || validation.issues.length < 6,
      program,
      atlas,
      validation,
      totalCostUsd: totalCost,
      durationMs: Date.now() - start,
      warnings,
      errors
    };
  }

  private async generateBase(
    input: HatchPipelineInput,
    tier: ImageTierName
  ): Promise<{ png: Buffer; costUsd?: number }> {
    const prompt = buildHatchPetBasePrompt({
      characterName: input.characterName,
      appearance: input.appearance,
      userHint: undefined,
      stylePreset: input.stylePreset ?? "auto",
      chromaKey: DEFAULT_CHROMA
    });

    const userRefs = input.userReferences.map((r) => r.url);

    const res =
      userRefs.length > 0
        ? await this.deps.imageGen.edit({
            prompt,
            images: userRefs,
            tier,
            transparentBackground: true
          })
        : await this.deps.imageGen.generate({
            prompt,
            tier,
            transparentBackground: true
          });
    if (res.kind === "error") {
      throw new Error(`${res.code}: ${res.message}`);
    }
    return { png: res.buffer, costUsd: res.estimatedCostUsd };
  }

  private async generateRow(
    rowState: HatchPetRowState,
    frameCount: number,
    cell: { width: number; height: number },
    canonicalBasePng: Buffer,
    input: HatchPipelineInput,
    tier: ImageTierName
  ): Promise<{ png: Buffer; costUsd?: number }> {
    const prompt = buildHatchPetRowPrompt({
      characterName: input.characterName,
      appearance: input.appearance,
      rowState,
      frameCount,
      cell,
      stylePreset: input.stylePreset ?? "auto",
      chromaKey: DEFAULT_CHROMA
    });
    const layoutGuide = makeLayoutGuide({
      frameCount,
      cell,
      safeMargin: 12
    });
    const images: string[] = [
      bufferToDataUrl(canonicalBasePng, "image/png"),
      bufferToDataUrl(layoutGuide, "image/png"),
      ...input.userReferences.map((r) => r.url)
    ];
    const res = await this.deps.imageGen.edit({
      prompt,
      images,
      tier,
      transparentBackground: true,
      // row strip 是宽幅，OpenAI Images 不允许任意宽高比；这里按 1024×1024 兜底，
      // pet-atlas-tools 在裁帧时会 resize 到目标 cell。
      size: "1024x1024"
    });
    if (res.kind === "error") {
      throw new Error(`${res.code}: ${res.message}`);
    }
    return { png: res.buffer, costUsd: res.estimatedCostUsd };
  }
}

function abortResult(start: number): HatchPipelineResult {
  return {
    ok: false,
    totalCostUsd: 0,
    durationMs: Date.now() - start,
    warnings: [],
    errors: ["pipeline aborted"]
  };
}

function bufferToDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}
