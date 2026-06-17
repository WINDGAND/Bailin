import { z } from "zod";
import { SPRITE_STATES, SPRITE_EVENTS } from "./sprite-states.js";

/**
 * AtlasPetProgram：以 1536×1872 精灵图集驱动的桌宠形象。
 *
 * 直接对齐 [Codex Pet Contract](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)：
 *   - 默认网格：8 列 × 9 行
 *   - 单格：192×208 像素
 *   - 透明背景；尾部未用格保持完全透明
 *   - 9 个行级状态：idle / running-right / running-left / waving / jumping / failed /
 *     waiting / running / review
 *
 * 设计目标：把 hatch-pet 的资产格式作为百灵的 atlas 子协议落地，同时保留
 * 我们内部的 SpriteState 抽象，避免 UI / 状态机为了换个生成路径就重写。
 */

/**
 * Codex Pet Contract 中定义的 9 个行级状态。
 * 写在协议里只是为了 schema 校验 + Prompt 模板复用；
 * 真正绑定到 SpriteState 由 `states` 字段决定。
 */
export const HATCH_PET_ROW_STATES = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review"
] as const;

export type HatchPetRowState = (typeof HATCH_PET_ROW_STATES)[number];

/** Codex 默认每行帧数（≤ 8 列）。可在 manifest 中覆盖。 */
export const DEFAULT_ROW_FRAME_COUNTS: Record<HatchPetRowState, number> = {
  idle: 6,
  "running-right": 8,
  "running-left": 8,
  waving: 6,
  jumping: 6,
  failed: 4,
  waiting: 6,
  running: 6,
  review: 4
};

export const DEFAULT_ATLAS_CELL = { width: 192, height: 208 } as const;
export const DEFAULT_ATLAS_GRID = { columns: 8, rows: 9 } as const;
export const DEFAULT_ATLAS_SIZE = {
  width: DEFAULT_ATLAS_CELL.width * DEFAULT_ATLAS_GRID.columns, // 1536
  height: DEFAULT_ATLAS_CELL.height * DEFAULT_ATLAS_GRID.rows // 1872
} as const;

const PositiveInt = z.number().int().positive();

const AtlasStateBindingSchema = z.object({
  /** 行索引，0 = 第一行；越界由渲染层兜底（fallback 到 row 0）。 */
  row: z.number().int().min(0).max(31),
  /** 该状态实际使用的帧数。必须 ≤ grid.columns。 */
  frameCount: z.number().int().min(1).max(32),
  /** 帧率；hatch-pet 默认 6~12，sleep / waiting 类可以 2~4。 */
  fps: z.number().positive().max(60),
  /** 是否循环。click 等一次性动作可设 false。 */
  loop: z.boolean(),
  /** 可选语义标签，记录这一行的原始 hatch-pet 状态名。 */
  hatchRow: z.enum(HATCH_PET_ROW_STATES).optional()
});

const AtlasTransitionSchema = z.object({
  on: z.enum(SPRITE_EVENTS),
  to: z.enum(SPRITE_STATES),
  guard: z.string().max(120).optional()
});

const AtlasStateMachineSchema = z.object({
  initial: z.enum(SPRITE_STATES),
  states: z.record(
    z.enum(SPRITE_STATES),
    z.object({
      transitions: z.array(AtlasTransitionSchema)
    })
  )
});

export const AtlasAssetUrlSchema = z
  .string()
  .min(1)
  .refine(
    (s) =>
      s.startsWith("data:") ||
      s.startsWith("file://") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("bailin-asset://"),
    {
      message:
        "atlas 资源必须是 data:/file://(已授权)/http(s)://(开发用)/bailin-asset:// 之一"
    }
  );

export const AtlasPetSchema = z.object({
  /** spritesheet 在渲染端可访问的 URL；通常是 data URI 或自定义协议。 */
  spritesheetUrl: AtlasAssetUrlSchema,
  /** 图集图像格式，渲染层据此决定 mime / 编解码。 */
  imageFormat: z.enum(["webp", "png"]).default("webp"),
  /** 单格尺寸；默认 192×208，遵循 Codex Pet Contract。 */
  cell: z
    .object({
      width: PositiveInt.max(1024),
      height: PositiveInt.max(1024)
    })
    .default(DEFAULT_ATLAS_CELL),
  /** 网格布局；默认 8×9。 */
  grid: z
    .object({
      columns: PositiveInt.max(16),
      rows: PositiveInt.max(16)
    })
    .default(DEFAULT_ATLAS_GRID),
  /** 从 SpriteState 到行级配置的绑定；至少要给 `idle`。 */
  states: z
    .record(z.enum(SPRITE_STATES), AtlasStateBindingSchema)
    .refine((m) => "idle" in m, {
      message: "atlas.states 至少要包含 idle"
    }),
  /** 桌宠的状态机；event → state 转移，沿用 SpriteEvent / SpriteState。 */
  stateMachine: AtlasStateMachineSchema,
  /** QA 联系单（contact sheet）地址，可选。 */
  contactSheetUrl: AtlasAssetUrlSchema.optional(),
  /** QA 动作预览（preview.webp / preview.gif）地址，可选。 */
  previewUrl: AtlasAssetUrlSchema.optional(),
  /** 创建本图集时的 hatch run id，用于诊断 / 重放。 */
  hatchRunId: z.string().optional(),
  /** 用于诊断的生图记录（base / row jobs 的 prompt 和耗时）。 */
  meta: z
    .object({
      generator: z.string().min(1),
      generatedAt: z.number().int().positive(),
      modelTier: z.enum(["economy", "standard", "premium"]).optional(),
      baseModel: z.string().optional(),
      rowModel: z.string().optional(),
      totalCostUsd: z.number().nonnegative().optional()
    })
    .optional()
});

export type AtlasPet = z.infer<typeof AtlasPetSchema>;
export type AtlasStateBinding = z.infer<typeof AtlasStateBindingSchema>;

/**
 * 默认状态机：把 hatch-pet 的 9 行映射到百灵 SpriteState。
 * 任何上层（生成、回退、内置精品）都可以从这里起步。
 */
export function defaultAtlasStateMachine(): AtlasPet["stateMachine"] {
  return {
    initial: "idle",
    states: {
      idle: {
        transitions: [
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" },
          { on: "responseStart", to: "think" },
          { on: "screenLock", to: "sleep" },
          { on: "chatError", to: "sad" }
        ]
      },
      walk: {
        transitions: [
          { on: "tick", to: "idle", guard: "rand() < 0.02" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" }
        ]
      },
      click: {
        transitions: [{ on: "tick", to: "idle", guard: "frameDone()" }]
      },
      drag: {
        transitions: [{ on: "dragEnd", to: "idle" }]
      },
      talk: {
        transitions: [
          { on: "chatClose", to: "idle" },
          { on: "responseStart", to: "think" },
          { on: "chatError", to: "sad" }
        ]
      },
      think: {
        transitions: [
          { on: "responseStreaming", to: "work" },
          { on: "chatError", to: "sad" }
        ]
      },
      work: {
        transitions: [
          { on: "responseEnd", to: "idle" },
          { on: "chatError", to: "sad" }
        ]
      },
      sleep: {
        transitions: [
          { on: "screenUnlock", to: "idle" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" }
        ]
      },
      sad: {
        transitions: [{ on: "tick", to: "idle", guard: "frameDone()" }]
      },
      fidget: {
        transitions: [
          { on: "tick", to: "idle", guard: "frameDone()" },
          { on: "click", to: "click" },
          { on: "chatOpen", to: "talk" },
          { on: "dragStart", to: "drag" }
        ]
      }
    }
  };
}

/**
 * 默认绑定：从 hatch-pet 的 9 行映射到百灵的 SpriteState。
 * 假设行顺序按 HATCH_PET_ROW_STATES 排布；如果生成端按其它顺序拼图集，
 * 调用方必须传入自己的 binding。
 */
export function defaultAtlasStateBindings(
  frameCounts: Partial<Record<HatchPetRowState, number>> = {}
): Record<string, AtlasStateBinding> {
  const fc = { ...DEFAULT_ROW_FRAME_COUNTS, ...frameCounts };
  const rowIndex: Record<HatchPetRowState, number> = HATCH_PET_ROW_STATES.reduce(
    (acc, name, i) => {
      acc[name] = i;
      return acc;
    },
    {} as Record<HatchPetRowState, number>
  );
  return {
    idle: {
      row: rowIndex.idle,
      frameCount: fc.idle,
      fps: 6,
      loop: true,
      hatchRow: "idle"
    },
    walk: {
      row: rowIndex["running-right"],
      frameCount: fc["running-right"],
      fps: 10,
      loop: true,
      hatchRow: "running-right"
    },
    click: {
      row: rowIndex.jumping,
      frameCount: fc.jumping,
      fps: 12,
      loop: false,
      hatchRow: "jumping"
    },
    drag: {
      row: rowIndex["running-right"],
      frameCount: fc["running-right"],
      fps: 10,
      loop: true,
      hatchRow: "running-right"
    },
    talk: {
      row: rowIndex.waving,
      frameCount: fc.waving,
      fps: 8,
      loop: true,
      hatchRow: "waving"
    },
    think: {
      row: rowIndex.review,
      frameCount: fc.review,
      fps: 6,
      loop: true,
      hatchRow: "review"
    },
    work: {
      row: rowIndex.running,
      frameCount: fc.running,
      fps: 8,
      loop: true,
      hatchRow: "running"
    },
    sleep: {
      row: rowIndex.waiting,
      frameCount: fc.waiting,
      fps: 3,
      loop: true,
      hatchRow: "waiting"
    },
    sad: {
      row: rowIndex.failed,
      frameCount: fc.failed,
      fps: 6,
      loop: false,
      hatchRow: "failed"
    },
    fidget: {
      row: rowIndex.jumping,
      frameCount: fc.jumping,
      fps: 10,
      loop: false,
      hatchRow: "jumping"
    }
  };
}

/** 左向散步时 walk 状态使用的行绑定（渲染层按 walkDirection 选用）。 */
export function atlasWalkLeftBinding(
  frameCounts: Partial<Record<HatchPetRowState, number>> = {}
): AtlasStateBinding {
  const fc = { ...DEFAULT_ROW_FRAME_COUNTS, ...frameCounts };
  const rowIndex = HATCH_PET_ROW_STATES.indexOf("running-left");
  return {
    row: rowIndex,
    frameCount: fc["running-left"],
    fps: 10,
    loop: true,
    hatchRow: "running-left"
  };
}

/**
 * 将已有 atlas 角色的 stateMachine / states 与当前默认配置合并，
 * 使旧 bundle 无需重跑 hatch 即可获得新动作绑定。
 */
export function mergeAtlasRuntimeDefaults(atlas: AtlasPet): AtlasPet {
  const defaults = defaultAtlasStateBindings();
  const defaultSm = defaultAtlasStateMachine();
  const mergedStates = { ...atlas.states, ...defaults };
  const mergedSmStates = { ...atlas.stateMachine.states, ...defaultSm.states };
  return {
    ...atlas,
    states: mergedStates as AtlasPet["states"],
    stateMachine: {
      initial: defaultSm.initial,
      states: mergedSmStates as AtlasPet["stateMachine"]["states"]
    }
  };
}
