import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHARACTER_ACCENT_PALETTE,
  resolveCharacterAccent
} from "./character-accent.js";

describe("resolveCharacterAccent", () => {
  it("同一角色 id 恒定同色", () => {
    const a = resolveCharacterAccent("char-abc", "light");
    const b = resolveCharacterAccent("char-abc", "light");
    assert.deepEqual(a, b);
  });

  it("不同角色不会全部挤在同一色", () => {
    const seen = new Set(
      ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"].map(
        (id) => resolveCharacterAccent(id, "light").accent
      )
    );
    assert.ok(seen.size >= 2);
  });

  it("明暗主题都返回合法 hex", () => {
    for (const theme of ["light", "dark"] as const) {
      const { accent, strong } = resolveCharacterAccent("char-xyz", theme);
      assert.match(accent, /^#[0-9a-f]{6}$/i);
      assert.match(strong, /^#[0-9a-f]{6}$/i);
    }
  });

  it("调色板数量与实现一致", () => {
    assert.ok(CHARACTER_ACCENT_PALETTE.length >= 5);
  });
});
