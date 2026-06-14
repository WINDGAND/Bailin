import type { CharacterBundle } from "@nuwa-pet/character-protocol";
import { elonMuskBundle } from "./bundles/elon-musk.js";
import { trumpBundle } from "./bundles/trump.js";
import { zhangXuefengBundle } from "./bundles/zhang-xuefeng.js";
import { mrBeastBundle } from "./bundles/mrbeast.js";
import { erenYeagerBundle } from "./bundles/eren-yeager.js";
import { kobeBryantBundle } from "./bundles/kobe-bryant.js";

export const STARTER_BUNDLES: ReadonlyArray<CharacterBundle> = [
  elonMuskBundle,
  trumpBundle,
  zhangXuefengBundle,
  mrBeastBundle,
  erenYeagerBundle,
  kobeBryantBundle
];

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

export { elonMuskBundle, trumpBundle, zhangXuefengBundle, mrBeastBundle, erenYeagerBundle, kobeBryantBundle };

// 暴露给 main 进程的 sprite-builder 复用的通用动画/状态机/影子工厂
export {
  baseAnimations,
  standardStateMachine,
  standardShadow,
  withFidgetVariants
} from "./sprites/_common-animations.js";
