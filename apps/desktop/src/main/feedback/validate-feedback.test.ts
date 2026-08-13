import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateFeedbackInput } from "./validate-feedback.js";

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

describe("validateFeedbackInput", () => {
  it("rejects body shorter than 8 after trim", () => {
    const r = validateFeedbackInput({ body: "  1234567  ", files: [] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid");
  });

  it("accepts body of exactly 8", () => {
    const r = validateFeedbackInput({ body: "12345678", files: [] });
    assert.equal(r.ok, true);
  });

  it("rejects body longer than 4000", () => {
    const r = validateFeedbackInput({ body: "x".repeat(4001), files: [] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid");
  });

  it("accepts body of exactly 4000", () => {
    const r = validateFeedbackInput({ body: "x".repeat(4000), files: [] });
    assert.equal(r.ok, true);
  });

  it("omits blank contact", () => {
    const r = validateFeedbackInput({ body: "12345678", contact: "  ", files: [] });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.contact, undefined);
  });

  it("accepts a valid email contact", () => {
    const r = validateFeedbackInput({ body: "12345678", contact: "  me+dev@example.com  ", files: [] });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.contact, "me+dev@example.com");
  });

  it("rejects non-email contact", () => {
    const r = validateFeedbackInput({ body: "12345678", contact: "my_wechat", files: [] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid");
  });

  it("rejects contact longer than 200", () => {
    const r = validateFeedbackInput({ body: "12345678", contact: "c".repeat(201), files: [] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid");
  });

  it("accepts 0 and 3 png files", () => {
    const file = { name: "a.png", mime: "image/png", bytes: pngBytes() };
    assert.equal(validateFeedbackInput({ body: "12345678", files: [] }).ok, true);
    assert.equal(validateFeedbackInput({ body: "12345678", files: [file, file, file] }).ok, true);
  });

  it("rejects 4 files", () => {
    const file = { name: "a.png", mime: "image/png", bytes: pngBytes() };
    const r = validateFeedbackInput({ body: "12345678", files: [file, file, file, file] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid");
  });

  it("rejects non-image bytes even if mime claims png", () => {
    const r = validateFeedbackInput({
      body: "12345678",
      files: [{ name: "a.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3, 4]) }]
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "invalid");
  });

  it("rejects file over 5MB", () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const r = validateFeedbackInput({
      body: "12345678",
      files: [{ name: "a.png", mime: "image/png", bytes }]
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "too_large");
  });
});
