import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankImage, polishChromaMatte } from "./png.js";

describe("polishChromaMatte green despill", () => {
  it("neutralizes dark green antialias residue beside transparent pixels", () => {
    const image = blankImage(3, 3);
    const center = (1 * image.width + 1) * 4;
    image.data[center] = 2;
    image.data[center + 1] = 40;
    image.data[center + 2] = 0;
    image.data[center + 3] = 255;

    const polished = polishChromaMatte(image, {
      chromaKey: { r: 0, g: 255, b: 0 },
      seedThreshold: 60,
      spillThreshold: 75,
      greenSpill: true
    });

    const r = polished.data[center] ?? 0;
    const g = polished.data[center + 1] ?? 0;
    const b = polished.data[center + 2] ?? 0;
    assert.ok(g <= Math.max(r, b), `expected green channel to be despilled, got ${r},${g},${b}`);
  });

  it("also despills diagonal antialias pixels on a jagged outline", () => {
    const image = blankImage(5, 5);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        const i = (y * image.width + x) * 4;
        image.data[i] = 40;
        image.data[i + 1] = 30;
        image.data[i + 2] = 20;
        image.data[i + 3] = 255;
      }
    }
    const diagonal = (1 * image.width + 1) * 4;
    image.data[diagonal + 3] = 0;
    const center = (2 * image.width + 2) * 4;
    image.data[center] = 2;
    image.data[center + 1] = 40;
    image.data[center + 2] = 0;

    const polished = polishChromaMatte(image, {
      chromaKey: { r: 0, g: 255, b: 0 },
      seedThreshold: 60,
      spillThreshold: 75,
      greenSpill: true
    });

    assert.ok(
      (polished.data[center + 1] ?? 0) <=
        Math.max(polished.data[center] ?? 0, polished.data[center + 2] ?? 0)
    );
  });
});
