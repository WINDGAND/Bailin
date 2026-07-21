import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCharacterSignature } from "./character-signature.js";

describe("resolveCharacterSignature", () => {
  it("returns verified when quoteStatus is verified", () => {
    const r = resolveCharacterSignature({
      quoteOneLiner: "当下就是最慷慨的礼物。",
      quoteStatus: "verified",
      signatureVocabulary: ["顺其自然。"],
      selfIntro: "我是田馥甄。"
    });
    assert.equal(r.status, "verified");
    assert.equal(r.text, "当下就是最慷慨的礼物。");
    assert.equal(r.canRetry, false);
  });

  it("treats skeleton placeholder as missing quote and falls back to provisional", () => {
    const r = resolveCharacterSignature({
      quoteOneLiner: "我还没准备好。",
      signatureVocabulary: ["走回心里才能找到方向"],
      selfIntro: "我是田馥甄。"
    });
    assert.equal(r.status, "provisional");
    assert.equal(r.text, "走回心里才能找到方向");
    assert.equal(r.canRetry, true);
  });

  it("returns provisional from selfIntro when no signature vocabulary", () => {
    const r = resolveCharacterSignature({
      quoteStatus: "missing",
      signatureVocabulary: [],
      selfIntro: "我是田馥甄，一个安静但坚定的陪伴者。"
    });
    assert.equal(r.status, "provisional");
    assert.equal(r.text, "我是田馥甄，一个安静但坚定的陪伴者。");
    assert.equal(r.canRetry, true);
  });

  it("returns missing when nothing usable remains", () => {
    const r = resolveCharacterSignature({
      quoteOneLiner: "我还没准备好。",
      quoteStatus: "missing",
      signatureVocabulary: [],
      selfIntro: ""
    });
    assert.equal(r.status, "missing");
    assert.equal(r.text, "");
    assert.equal(r.canRetry, true);
  });

  it("legacy cards with a real quote and no status are verified", () => {
    const r = resolveCharacterSignature({
      quoteOneLiner: "当下就是最慷慨的礼物。",
      signatureVocabulary: ["顺其自然。"],
      selfIntro: "我是田馥甄。"
    });
    assert.equal(r.status, "verified");
    assert.equal(r.text, "当下就是最慷慨的礼物。");
    assert.equal(r.canRetry, false);
  });
});
