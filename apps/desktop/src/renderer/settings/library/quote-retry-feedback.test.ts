import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretQuoteRetryResult } from "./quote-retry-feedback.js";

describe("interpretQuoteRetryResult", () => {
  it("treats ok as verified", () => {
    assert.deepEqual(interpretQuoteRetryResult({ ok: true }), { kind: "verified" });
  });

  it("treats quoteStatus verified as verified even if ok is false", () => {
    assert.deepEqual(
      interpretQuoteRetryResult({ ok: false, quoteStatus: "verified" }),
      { kind: "verified" }
    );
  });

  it("maps provisional to unverified", () => {
    assert.deepEqual(
      interpretQuoteRetryResult({ ok: false, quoteStatus: "provisional" }),
      { kind: "unverified" }
    );
  });

  it("maps missing to unverified", () => {
    assert.deepEqual(
      interpretQuoteRetryResult({
        ok: false,
        quoteStatus: "missing",
        error: "仍未能核实代表性原话"
      }),
      { kind: "unverified" }
    );
  });

  it("maps hard failure without status to error", () => {
    assert.deepEqual(
      interpretQuoteRetryResult({ ok: false, error: "角色不存在" }),
      { kind: "error", error: "角色不存在" }
    );
  });

  it("falls back to unverified when failed with no status and no error", () => {
    assert.deepEqual(interpretQuoteRetryResult({ ok: false }), { kind: "unverified" });
  });
});
