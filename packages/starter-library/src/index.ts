import type { CharacterBundle } from "@nuwa-pet/character-protocol";

/** 内置 starter 角色（当前为空；保留类型与 API 供向导 / IPC 复用）。 */
export const STARTER_BUNDLES: ReadonlyArray<CharacterBundle> = [];

export interface StarterMeta {
  id: string;
  name: string;
  sourceName: string;
  track: "utility" | "companion";
  blurb: string;
}

export const STARTER_META: StarterMeta[] = STARTER_BUNDLES.map((b) => ({
  id: b.card.id,
  name: b.card.meta.name,
  sourceName: b.card.meta.sourceName ?? b.card.meta.name,
  track: b.card.meta.track,
  blurb: b.card.meta.quoteOneLiner ?? ""
}));

export function findStarterById(id: string): CharacterBundle | undefined {
  return STARTER_BUNDLES.find((b) => b.card.id === id);
}

// 暴露给 main 进程的 sprite-builder 复用的通用动画/状态机/影子工厂
export {
  baseAnimations,
  standardStateMachine,
  standardShadow,
  withFidgetVariants
} from "./sprites/_common-animations.js";
