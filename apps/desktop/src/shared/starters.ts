import type { CharacterBundle } from "@bailin/character-protocol";

/** 内置 starter 角色（当前为空；将来可在此追加 CharacterBundle）。 */
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
