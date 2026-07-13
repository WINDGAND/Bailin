import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSourceContextPriority } from "./resolve-source-context.js";

describe("resolveSourceContextPriority", () => {
  it("prefers explicit sourceContext over hint and LLM", () => {
    const r = resolveSourceContextPriority({
      sourceContext: " 进击的巨人 ",
      userHint: "《进击的巨人》里的艾伦",
      userMaterial: "",
      sourceType: "fictional"
    });
    assert.deepEqual(r, {
      kind: "explicit",
      sourceContext: "进击的巨人"
    });
  });

  it("extracts 《作品》 from hint when no explicit", () => {
    const r = resolveSourceContextPriority({
      userHint: "《三体》里的罗辑",
      sourceType: "fictional"
    });
    assert.equal(r.kind, "hint");
    if (r.kind === "hint") assert.equal(r.sourceContext, "三体");
  });

  it("extracts paren hint when no book-title marks", () => {
    const r = resolveSourceContextPriority({
      userMaterial: "罗辑（三体）",
      sourceType: "fictional"
    });
    assert.equal(r.kind, "hint");
    if (r.kind === "hint") assert.equal(r.sourceContext, "三体");
  });

  it("returns needs_llm for non-original without anchors", () => {
    const r = resolveSourceContextPriority({
      sourceType: "fictional"
    });
    assert.equal(r.kind, "needs_llm");
  });

  it("returns none for original without anchors", () => {
    const r = resolveSourceContextPriority({
      sourceType: "original"
    });
    assert.equal(r.kind, "none");
  });

  it("truncates explicit sourceContext to 40 chars", () => {
    const long = "甲".repeat(50);
    const r = resolveSourceContextPriority({
      sourceContext: long,
      sourceType: "fictional"
    });
    assert.equal(r.kind, "explicit");
    if (r.kind === "explicit") assert.equal(r.sourceContext.length, 40);
  });
});
