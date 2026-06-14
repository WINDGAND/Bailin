import { z } from "zod";

/**
 * LayeredPetDSL：参考图分层 + CSS 骨骼桌宠。
 * mode=layered-css 时写入 SpriteProgram.layered。
 */

export const LAYERED_ANIMATION_NAMES = [
  "idle",
  "idle-blink",
  "walk-left",
  "walk-right",
  "click-reaction",
  "drag",
  "talk",
  "think",
  "sleep",
  "fidget-a",
  "fidget-b",
  "signature"
] as const;

export const LAYERED_SPRITE_STATES = [
  "idle",
  "walk",
  "click",
  "drag",
  "talk",
  "think",
  "sleep",
  "fidget"
] as const;

export const LAYERED_SPRITE_EVENTS = [
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

export const LAYER_BONES = [
  "root",
  "shadow",
  "body",
  "head",
  "hair-back",
  "hair-front",
  "face",
  "eyes",
  "mouth",
  "outfit",
  "accessory",
  "gear-l",
  "gear-r"
] as const;

export const SIGNATURE_MOTIONS = [
  "wave",
  "nod",
  "bounce",
  "salute",
  "sparkle",
  "flex"
] as const;

export const EMOTION_KINDS = [
  "neutral",
  "happy",
  "excited",
  "think",
  "sleep",
  "surprised",
  "love",
  "focused"
] as const;

export type LayerBone = (typeof LAYER_BONES)[number];
export type SignatureMotion = (typeof SIGNATURE_MOTIONS)[number];
export type EmotionKind = (typeof EMOTION_KINDS)[number];

const PointSchema = z.object({
  x: z.number(),
  y: z.number()
});

const LayerSchema = z.object({
  id: z.string().min(1),
  bone: z.enum(LAYER_BONES),
  z: z.number().int(),
  type: z.enum(["image", "css-shape", "overlay"]),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  imageUrl: z.string().min(1).optional(),
  objectFit: z.enum(["contain", "cover"]).optional(),
  crop: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1)
    })
    .optional(),
  shape: z.enum(["ellipse", "rect", "rounded-rect"]).optional(),
  fill: z.string().optional(),
  gradient: z.string().optional(),
  borderRadius: z.number().optional(),
  boxShadow: z.string().optional(),
  transformOrigin: PointSchema.optional(),
  opacity: z.number().min(0).max(1).optional()
});

const EyeSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  size: z.number().positive().max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  pupilColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});

const RigSchema = z.object({
  eyeTracking: z.boolean().default(true),
  blinkEnabled: z.boolean().default(true),
  leftEye: EyeSchema.optional(),
  rightEye: EyeSchema.optional(),
  characterBounds: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1)
    })
    .optional(),
  hasTransparentBg: z.boolean().optional()
});

const TransitionSchema = z.object({
  on: z.enum(LAYERED_SPRITE_EVENTS),
  to: z.enum(LAYERED_SPRITE_STATES),
  guard: z.string().max(120).optional()
});

const StateDefSchema = z.object({
  animation: z.enum(LAYERED_ANIMATION_NAMES),
  transitions: z.array(TransitionSchema)
});

export const LayeredPetDSLSchema = z.object({
  canvas: z.object({
    width: z.number().int().positive().max(512),
    height: z.number().int().positive().max(512)
  }),
  primarySource: z.enum(["reference", "css-generated"]),
  layers: z.array(LayerSchema).min(1).max(24),
  rig: RigSchema,
  signature: z.enum(SIGNATURE_MOTIONS).default("wave"),
  defaultEmotion: z.enum(EMOTION_KINDS).default("neutral"),
  stateMachine: z.object({
    initial: z.enum(LAYERED_SPRITE_STATES),
    states: z.record(z.enum(LAYERED_SPRITE_STATES), StateDefSchema)
  })
});

export type LayeredPetDSL = z.infer<typeof LayeredPetDSLSchema>;
export type LayeredPetLayer = z.infer<typeof LayerSchema>;
export type LayeredPetRig = z.infer<typeof RigSchema>;
export type LayeredRigHints = {
  characterBounds?: { x: number; y: number; w: number; h: number };
  leftEye?: { x: number; y: number; size?: number };
  rightEye?: { x: number; y: number; size?: number };
  hasTransparentBg?: boolean;
  signature?: SignatureMotion;
};
