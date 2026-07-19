import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkQuoteEvidence } from "./quote-evidence.js";

describe("checkQuoteEvidence", () => {
  it("passes when speaker and work both match the identity contract", () => {
    const r = checkQuoteEvidence({
      candidate: {
        quoteOneLiner: "Silly monkey. You were never out of my reach.（傻猴子，你从未逃出我的掌控。）",
        speaker: "Tatsumi",
        work: "斩赤红之瞳",
        sourceUrl: "https://example.com/akame-ga-kill/quotes"
      },
      chineseName: "塔兹米",
      englishName: "Tatsumi",
      sourceContext: "斩赤红之瞳",
      citations: ["https://example.com/akame-ga-kill/quotes"],
      sourceType: "fictional"
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.reasons, []);
  });

  it("rejects a quote whose speaker does not match the target character (Tatsumi bad case)", () => {
    const r = checkQuoteEvidence({
      candidate: {
        quoteOneLiner: "Silly monkey. You were never out of my reach.（傻猴子，你从未逃出我的掌控。）",
        speaker: "Esdeath",
        work: "Akame ga Kill!",
        sourceUrl: "https://example.com/akame-ga-kill/quotes"
      },
      chineseName: "塔兹米",
      englishName: "Tatsumi",
      sourceContext: "斩赤红之瞳",
      citations: ["https://example.com/akame-ga-kill/quotes"],
      sourceType: "fictional"
    });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.includes("speaker")));
  });

  it("rejects a quote whose work does not match the locked sourceContext", () => {
    const r = checkQuoteEvidence({
      candidate: {
        quoteOneLiner: "test quote",
        speaker: "塔兹米",
        work: "某完全不相关的作品",
        sourceUrl: ""
      },
      chineseName: "塔兹米",
      englishName: "Tatsumi",
      sourceContext: "斩赤红之瞳",
      citations: [],
      sourceType: "fictional"
    });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.includes("work")));
  });

  it("rejects when sourceUrl is not among the real tool citations (fabricated source)", () => {
    const r = checkQuoteEvidence({
      candidate: {
        quoteOneLiner: "test quote",
        speaker: "塔兹米",
        work: "斩赤红之瞳",
        sourceUrl: "https://made-up-domain.example/fake"
      },
      chineseName: "塔兹米",
      englishName: "Tatsumi",
      sourceContext: "斩赤红之瞳",
      citations: ["https://real-citation.example/actual"],
      sourceType: "fictional"
    });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.includes("sourceUrl")));
  });

  it("rejects when speaker is missing for a non-original character", () => {
    const r = checkQuoteEvidence({
      candidate: { quoteOneLiner: "test quote" },
      chineseName: "塔兹米",
      englishName: "Tatsumi",
      citations: [],
      sourceType: "fictional"
    });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.some((x) => x.includes("speaker")));
  });

  it("accepts any non-empty quote for original characters without external evidence", () => {
    const r = checkQuoteEvidence({
      candidate: { quoteOneLiner: "做自己人生的作者。" },
      chineseName: "小灵",
      citations: [],
      sourceType: "original"
    });
    assert.equal(r.ok, true);
  });

  it("rejects an empty quote regardless of sourceType", () => {
    const r = checkQuoteEvidence({
      candidate: { quoteOneLiner: "   " },
      chineseName: "小灵",
      citations: [],
      sourceType: "original"
    });
    assert.equal(r.ok, false);
  });
});
