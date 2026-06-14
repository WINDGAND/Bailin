import { z } from "zod";
import { SCHEMA_VERSION } from "./character-card.js";
import { LayeredPetDSLSchema } from "./layered-pet.js";

/**
 * SpriteProgram 描述一只桌宠"长什么样 / 怎么动"。
 * 默认走 DSL 模式；JS 沙箱模式仅在用户显式开启后启用。
 * 详细规范见 docs/product/CHARACTER-PROTOCOL.md §3。
 */

export const ANIMATION_NAMES = [
  "idle",
  "idle-blink",
  "walk-left",
  "walk-right",
  "click-reaction",
  "drag",
  "talk",
  "think",
  "sleep",
  // 个性化空闲行为：每只桌宠都可以注册自己专属的 fidget / signature 动作
  "fidget-a",
  "fidget-b",
  "signature"
] as const;

export const SPRITE_STATES = [
  "idle",
  "walk",
  "click",
  "drag",
  "talk",
  "think",
  "sleep",
  // 用于发起短暂的个性化小动作
  "fidget"
] as const;

export const SPRITE_EVENTS = [
  "tick",
  "click",
  "dragStart",
  "dragEnd",
  "chatOpen",
  "chatClose",
  "responseStart",
  "responseEnd",
  "idleLong",
  "screenLock",
  "screenUnlock"
] as const;

export type AnimationName = (typeof ANIMATION_NAMES)[number];
export type SpriteState = (typeof SPRITE_STATES)[number];
export type SpriteEvent = (typeof SPRITE_EVENTS)[number];

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
    mode: z.enum(["dsl", "js-sandbox", "layered-css"]),
    size: z.object({
      width: z.number().int().positive().max(512),
      height: z.number().int().positive().max(512)
    }),
    displayScale: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    palette: z.array(PaletteEntrySchema).min(2).max(16),
    dsl: SpriteDSLSchema.optional(),
    js: SpriteJSSchema.optional(),
    layered: LayeredPetDSLSchema.optional()
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
    if (value.mode === "layered-css" && !value.layered) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mode=layered-css requires field 'layered'",
        path: ["layered"]
      });
    }
  });

export type SpriteProgram = z.infer<typeof SpriteProgramSchema>;
export type SpriteDSL = z.infer<typeof SpriteDSLSchema>;
export type SpritePart = z.infer<typeof PartSchema>;
export type PaletteEntry = z.infer<typeof PaletteEntrySchema>;
export type { LayeredPetDSL, LayeredPetLayer, LayeredPetRig, LayeredRigHints } from "./layered-pet.js";
