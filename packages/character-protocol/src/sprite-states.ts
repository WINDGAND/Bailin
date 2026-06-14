/**
 * 状态枚举常量：抽到独立模块，避免 sprite-program.ts ↔ atlas-pet.ts 的循环依赖。
 *
 * 任何子协议（DSL / layered-css / atlas）都应从这里导入 SPRITE_STATES / SPRITE_EVENTS /
 * ANIMATION_NAMES，而不是从 sprite-program 反向导入。
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
