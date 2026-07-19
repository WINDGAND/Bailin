import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectHatchChromaKey } from "./hatch-pet-pipeline.js";

describe("selectHatchChromaKey", () => {
  it("uses green chroma for opaque-only models so white clothes and shoes keep clean edges", () => {
    assert.deepEqual(selectHatchChromaKey(false), { r: 0, g: 255, b: 0 });
  });

  it("uses the same green key when native transparency is available", () => {
    assert.deepEqual(selectHatchChromaKey(true), { r: 0, g: 255, b: 0 });
  });
});
