import { z } from "zod";
import { SCHEMA_VERSION } from "./character-card.js";
import { AtlasPetSchema } from "./atlas-pet.js";

/**
 * SpriteProgram 描述一只桌宠"长什么样 / 怎么动"。
 *
 * 支持三种 mode：
 *   - dsl          手写 / 程序化像素 DSL，starter-library 默认走这条
 *   - js-sandbox   受限 JS 渲染（默认禁用，未来开关）
 *   - atlas        hatch-pet 兼容的精灵图集（1536×1872 / 8×9 / 192×208）
 *
 * 详细规范见 docs/product/CHARACTER-PROTOCOL.md §3。
 */

export {
  ANIMATION_NAMES,
  SPRITE_STATES,
  SPRITE_EVENTS,
  type AnimationName,
  type SpriteState,
  type SpriteEvent
} from "./sprite-states.js";

import { ANIMATION_NAMES, SPRITE_STATES, SPRITE_EVENTS } from "./sprite-states.js";

const PaletteEntrySchema = z.object({
  name: z.string().min(1),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

const ShapeSchema = z.object({
  type: z.enum(["rect", "circle", "pixel", "line"]),
  x: z.number(),
  y: z.number(),
  w: z.number().optional(),
  h: z.number().optional(),
  r: z.number().optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  paletteIndex: z.number().int().min(0)
});

const PartSchema = z.object({
  id: z.string().min(1),
  z: z.number().int(),
  paletteIndex: z.number().int().min(0).optional(),
  pixels: z.array(z.string()).optional(),
  shapes: z.array(ShapeSchema).optional(),
  anchor: z.object({ x: z.number(), y: z.number() }).optional()
});

const TransformSchema = z.object({
  partId: z.string().min(1),
  dx: z.number().optional(),
  dy: z.number().optional(),
  rotate: z.number().optional(),
  scale: z.number().positive().optional(),
  visible: z.boolean().optional(),
  paletteSwap: z.number().int().min(0).optional()
});

const FrameSchema = z.object({
  duration: z.number().int().positive(),
  transforms: z.array(TransformSchema)
});

const AnimationSchema = z.object({
  fps: z.number().positive().max(60),
  loop: z.boolean(),
  frames: z.array(FrameSchema).min(1)
});

const TransitionSchema = z.object({
  on: z.enum(SPRITE_EVENTS),
  to: z.enum(SPRITE_STATES),
  guard: z.string().max(120).optional()
});

const StateDefSchema = z.object({
  animation: z.enum(ANIMATION_NAMES),
  transitions: z.array(TransitionSchema)
});

export const SpriteDSLSchema = z.object({
  parts: z.array(PartSchema).min(1).max(20),
  animations: z.record(z.enum(ANIMATION_NAMES), AnimationSchema),
  stateMachine: z.object({
    initial: z.enum(SPRITE_STATES),
    states: z.record(z.enum(SPRITE_STATES), StateDefSchema)
  })
});

export const SpriteJSSchema = z.object({
  source: z.string().min(1),
  entryFn: z.literal("renderFrame")
});

export const SpriteProgramSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    mode: z.enum(["dsl", "js-sandbox", "atlas"]),
    size: z.object({
      width: z.number().int().positive().max(2048),
      height: z.number().int().positive().max(2048)
    }),
    displayScale: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    palette: z.array(PaletteEntrySchema).min(2).max(16),
    dsl: SpriteDSLSchema.optional(),
    js: SpriteJSSchema.optional(),
    atlas: AtlasPetSchema.optional()
  })
  .superRefine((value, ctx) => {
    if (value.mode === "dsl" && !value.dsl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mode=dsl requires field 'dsl'",
        path: ["dsl"]
      });
    }
    if (value.mode === "js-sandbox" && !value.js) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mode=js-sandbox requires field 'js'",
        path: ["js"]
      });
    }
    if (value.mode === "atlas" && !value.atlas) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mode=atlas requires field 'atlas'",
        path: ["atlas"]
      });
    }
  });

export type SpriteProgram = z.infer<typeof SpriteProgramSchema>;
export type SpriteDSL = z.infer<typeof SpriteDSLSchema>;
export type SpritePart = z.infer<typeof PartSchema>;
export type PaletteEntry = z.infer<typeof PaletteEntrySchema>;
export type {
  AtlasPet,
  AtlasStateBinding,
  HatchPetRowState
} from "./atlas-pet.js";
export {
  HATCH_PET_ROW_STATES,
  DEFAULT_ROW_FRAME_COUNTS,
  DEFAULT_ATLAS_CELL,
  DEFAULT_ATLAS_GRID,
  DEFAULT_ATLAS_SIZE,
  defaultAtlasStateMachine,
  defaultAtlasStateBindings
} from "./atlas-pet.js";
