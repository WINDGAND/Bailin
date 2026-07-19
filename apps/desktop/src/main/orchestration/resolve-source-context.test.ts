import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCanonicalIdentityFromInput,
  resolveSourceContextPriority,
  splitCompoundCharacterInput
} from "./resolve-source-context.js";

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

describe("splitCompoundCharacterInput", () => {
  it("splits '作品 身份 姓名' space-separated compound input (Tatsumi bad case)", () => {
    const r = splitCompoundCharacterInput("斩赤红之瞳 男主角 塔兹米");
    assert.equal(r.changed, true);
    assert.equal(r.characterName, "塔兹米");
    assert.equal(r.sourceContext, "斩赤红之瞳");
    assert.equal(r.identityHint, "男主角");
  });

  it("splits 《作品》里面的身份，姓名 with book-title bracket", () => {
    const r = splitCompoundCharacterInput("《进击的巨人》里面的男主角，艾伦");
    assert.equal(r.changed, true);
    assert.equal(r.characterName, "艾伦");
    assert.equal(r.sourceContext, "进击的巨人");
    assert.equal(r.identityHint, "男主角");
  });

  it("leaves a plain single name untouched", () => {
    const r = splitCompoundCharacterInput("塔兹米");
    assert.equal(r.changed, false);
    assert.equal(r.characterName, "塔兹米");
    assert.equal(r.sourceContext, undefined);
  });

  it("leaves a real hyphenated / dotted name untouched", () => {
    const r = splitCompoundCharacterInput("薇尔莉特·伊芙加登");
    assert.equal(r.changed, false);
    assert.equal(r.characterName, "薇尔莉特·伊芙加登");
  });

  it("handles work + name without explicit role word", () => {
    const r = splitCompoundCharacterInput("三体 罗辑");
    assert.equal(r.changed, true);
    assert.equal(r.characterName, "罗辑");
    assert.equal(r.sourceContext, "三体");
  });

  it("trims whitespace-only input without throwing", () => {
    const r = splitCompoundCharacterInput("   ");
    assert.equal(r.changed, false);
    assert.equal(r.characterName, "");
  });
});

describe("buildCanonicalIdentityFromInput", () => {
  it("resolves compound input into a clean name + hint-confidence sourceContext (Tatsumi bad case)", () => {
    const identity = buildCanonicalIdentityFromInput({
      characterName: "斩赤红之瞳 男主角 塔兹米",
      sourceType: "fictional"
    });
    assert.equal(identity.characterName, "塔兹米");
    assert.equal(identity.sourceContext, "斩赤红之瞳");
    assert.equal(identity.identityHint, "男主角");
    assert.equal(identity.sourceContextConfidence, "hint");
    assert.equal(identity.rawInput, "斩赤红之瞳 男主角 塔兹米");
  });

  it("prefers explicit form sourceContext over a parsed hint", () => {
    const identity = buildCanonicalIdentityFromInput({
      characterName: "斩赤红之瞳 男主角 塔兹米",
      sourceContext: "Akame ga Kill",
      sourceType: "fictional"
    });
    assert.equal(identity.characterName, "塔兹米");
    assert.equal(identity.sourceContext, "Akame ga Kill");
    assert.equal(identity.sourceContextConfidence, "explicit");
  });

  it("marks sourceContext unresolved for a plain single name with no anchors", () => {
    const identity = buildCanonicalIdentityFromInput({
      characterName: "塔兹米",
      sourceType: "fictional"
    });
    assert.equal(identity.characterName, "塔兹米");
    assert.equal(identity.sourceContext, undefined);
    assert.equal(identity.sourceContextConfidence, "unresolved");
  });

  it("does not require sourceContext resolution for original characters", () => {
    const identity = buildCanonicalIdentityFromInput({
      characterName: "小灵",
      sourceType: "original"
    });
    assert.equal(identity.characterName, "小灵");
    assert.equal(identity.sourceContext, undefined);
    assert.equal(identity.sourceContextConfidence, "unresolved");
  });
});
