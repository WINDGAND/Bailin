/**
 * 角色专属 accent：由角色 id 哈希到一组与暖纸/洋红品牌相容的调色板。
 * 每个角色恒定一色——切换角色，聊天窗的气场随之切换。
 */
export interface CharacterAccent {
  /** 主 accent：marker / 左边条 / 图标色 */
  accent: string;
  /** 加深档：链接正文等需要对比度的场景 */
  strong: string;
}

interface AccentPair {
  light: CharacterAccent;
  dark: CharacterAccent;
}

export const CHARACTER_ACCENT_PALETTE: AccentPair[] = [
  { light: { accent: "#b21858", strong: "#8a113f" }, dark: { accent: "#d96f9c", strong: "#e89ab9" } },
  { light: { accent: "#a86f1c", strong: "#7d5211" }, dark: { accent: "#d99a3a", strong: "#e8b96b" } },
  { light: { accent: "#2e7d5b", strong: "#1f5c41" }, dark: { accent: "#5cb08a", strong: "#85c6a8" } },
  { light: { accent: "#b44a2f", strong: "#8c3520" }, dark: { accent: "#d97b5e", strong: "#e89e87" } },
  { light: { accent: "#1f6a72", strong: "#134a50" }, dark: { accent: "#63a8ae", strong: "#8cc2c7" } }
];

function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i += 1) {
    h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function resolveCharacterAccent(
  characterId: string,
  theme: "light" | "dark"
): CharacterAccent {
  const idx = hashId(characterId) % CHARACTER_ACCENT_PALETTE.length;
  return CHARACTER_ACCENT_PALETTE[idx]![theme];
}
