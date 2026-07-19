import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCharacterSignature } from "./character-signature.js";

describe("resolveCharacterSignature", () => {
  it("prefers a verified representative quote", () => {
    assert.equal(
      resolveCharacterSignature({
        quoteOneLiner: "当下就是最慷慨的礼物。",
        signatureVocabulary: ["顺其自然。"],
        selfIntro: "我是田馥甄。"
      }),
      "当下就是最慷慨的礼物。"
    );
  });

  it("falls back to expression DNA when quote lookup yields nothing", () => {
    assert.equal(
      resolveCharacterSignature({
        signatureVocabulary: ["走回心里才能找到方向", "时间会筛选一切"],
        selfIntro: "我是田馥甄。"
      }),
      "走回心里才能找到方向"
    );
  });

  it("always returns a non-empty signature for a valid character card", () => {
    assert.equal(
      resolveCharacterSignature({
        signatureVocabulary: [],
        selfIntro: "我是田馥甄，一个安静但坚定的陪伴者。"
      }),
      "我是田馥甄，一个安静但坚定的陪伴者。"
    );
  });
});
