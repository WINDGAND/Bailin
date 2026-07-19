import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blankImage,
  countInteriorTransparentPixels,
  decodePng,
  encodePng
} from "./png.js";
import {
  applyStripChromaPipeline,
  computeCanonicalBodyScale,
  computeCanonicalRowScales,
  computeRowBodyReference,
  extractStripFrames,
  finalizeAlignedFrames,
  MIN_FULL_BODY_ASPECT,
  resolveRowAlignMode,
  selectStripRawFrames,
  validateAtlas,
  composeAtlas,
  type RowSlot
} from "./frames.js";

const CELL = { width: 192, height: 208 };
const CHROMA = { r: 0, g: 255, b: 0 };

it("treats the failed reaction as motion because its pose intentionally shifts", () => {
  assert.equal(resolveRowAlignMode("failed"), "motion");
});

function fillChroma(img: ReturnType<typeof blankImage>, c: { r: number; g: number; b: number }): void {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = c.r;
    img.data[i + 1] = c.g;
    img.data[i + 2] = c.b;
    img.data[i + 3] = 255;
  }
}

function drawRect(
  img: ReturnType<typeof blankImage>,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number
): void {
  for (let y = y0; y < y0 + h && y < img.height; y += 1) {
    for (let x = x0; x < x0 + w && x < img.width; x += 1) {
      if (x < 0 || y < 0) continue;
      const idx = (y * img.width + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
}

/** 造一行 N 帧 strip：每帧画一个 (w x h) 的矮/高矩形，模拟半身 vs 全身。 */
function makeRowStrip(frameCount: number, bodyW: number, bodyH: number): Buffer {
  const strip = blankImage(CELL.width * frameCount, CELL.height);
  fillChroma(strip, CHROMA);
  for (let i = 0; i < frameCount; i += 1) {
    const cx = i * CELL.width + Math.floor((CELL.width - bodyW) / 2);
    const cy = CELL.height - 20 - bodyH; // 脚底留白，贴近底部安全区
    drawRect(strip, cx, cy, bodyW, bodyH, 40 + i * 5, 90, 160);
  }
  return encodePng(strip);
}

function buildSlot(stripPng: Buffer, frameCount: number, rowIndex: number, rowState?: string): RowSlot {
  return {
    rowIndex,
    frameCount,
    stripPng,
    rowState,
    chromaKey: CHROMA,
    chromaThreshold: 60
  };
}

describe("computeRowBodyReference / computeCanonicalBodyScale", () => {
  it("classifies a tall rectangle strip as full body", () => {
    const slot = buildSlot(makeRowStrip(4, 60, 150), 4, 0, "idle");
    const raw = selectStripRawFrames(slot, CELL);
    const ref = computeRowBodyReference(raw);
    assert.ok(ref.fullBodyFrameRatio >= 0.75, `expected mostly full-body, got ${ref.fullBodyFrameRatio}`);
  });

  it("classifies a wide/short rectangle strip as half body", () => {
    const slot = buildSlot(makeRowStrip(4, 150, 60), 4, 0, "idle");
    const raw = selectStripRawFrames(slot, CELL);
    const ref = computeRowBodyReference(raw, { minFullBodyAspect: MIN_FULL_BODY_ASPECT });
    assert.ok(ref.fullBodyFrameRatio <= 0.25, `expected mostly half-body, got ${ref.fullBodyFrameRatio}`);
  });

  it("keeps the same forced scale consistent across two differently-sized rows", () => {
    const idleSlot = buildSlot(makeRowStrip(4, 60, 150), 4, 0, "idle");
    const runSlot = buildSlot(makeRowStrip(4, 60, 150), 4, 1, "running-right");
    const idleRaw = selectStripRawFrames(idleSlot, CELL);
    const runRaw = selectStripRawFrames(runSlot, CELL);
    const idleRef = computeRowBodyReference(idleRaw);
    const runRef = computeRowBodyReference(runRaw);
    const scale = computeCanonicalBodyScale([idleRef, runRef], CELL);

    const idleFrames = finalizeAlignedFrames(idleRaw, CELL, {
      alignMode: "standing",
      forcedScale: scale
    });
    const runFrames = finalizeAlignedFrames(runRaw, CELL, {
      alignMode: "motion",
      forcedScale: scale
    });

    const idleHeights = idleFrames.map((f) => opaqueBBoxHeight(decodePng(f.png)));
    const runHeights = runFrames.map((f) => opaqueBBoxHeight(decodePng(f.png)));
    const idleAvg = avg(idleHeights);
    const runAvg = avg(runHeights);
    const deviation = Math.abs(idleAvg - runAvg) / Math.max(1, Math.max(idleAvg, runAvg));
    assert.ok(deviation < 0.1, `expected consistent scale across rows, idle=${idleAvg} run=${runAvg}`);
  });

  it("normalizes rows generated at different source sizes to the same visible body height", () => {
    const idleSlot = buildSlot(makeRowStrip(4, 60, 150), 4, 0, "idle");
    const runSlot = buildSlot(makeRowStrip(4, 36, 90), 4, 1, "running-right");
    const idleRaw = selectStripRawFrames(idleSlot, CELL);
    const runRaw = selectStripRawFrames(runSlot, CELL);
    const refs = [
      computeRowBodyReference(idleRaw),
      computeRowBodyReference(runRaw)
    ];
    const [idleScale, runScale] = computeCanonicalRowScales(refs, CELL);

    const idleFrames = finalizeAlignedFrames(idleRaw, CELL, {
      alignMode: "standing",
      forcedScale: idleScale
    });
    const runFrames = finalizeAlignedFrames(runRaw, CELL, {
      alignMode: "motion",
      forcedScale: runScale
    });

    const idleHeight = avg(idleFrames.map((f) => opaqueBBoxHeight(decodePng(f.png))));
    const runHeight = avg(runFrames.map((f) => opaqueBBoxHeight(decodePng(f.png))));
    const deviation = Math.abs(idleHeight - runHeight) / Math.max(idleHeight, runHeight);
    assert.ok(deviation < 0.1, `expected normalized heights, idle=${idleHeight} run=${runHeight}`);
    assert.ok(idleHeight >= 160, `expected sprite to fill the cell, got ${idleHeight}px`);
  });
});

describe("extractStripFrames forcedScale", () => {
  it("shrinks content when a smaller forcedScale is supplied", () => {
    const slot = buildSlot(makeRowStrip(2, 60, 150), 2, 0, "idle");
    const natural = extractStripFrames(slot, CELL);
    const forced = extractStripFrames(slot, CELL, { forcedScale: 0.4 });
    const naturalH = opaqueBBoxHeight(decodePng(natural[0]!.png));
    const forcedH = opaqueBBoxHeight(decodePng(forced[0]!.png));
    assert.ok(forcedH < naturalH, `expected forced scale to shrink content: natural=${naturalH} forced=${forcedH}`);
  });
});

describe("applyStripChromaPipeline", () => {
  it("preserves legitimate green pixels inside the foreground silhouette", () => {
    const image = blankImage(11, 11);
    drawRect(image, 1, 1, 9, 9, 40, 30, 20);
    const center = (5 * image.width + 5) * 4;
    image.data[center] = 0;
    image.data[center + 1] = 80;
    image.data[center + 2] = 0;
    image.data[center + 3] = 255;

    const processed = applyStripChromaPipeline(image, {
      rowIndex: 0,
      frameCount: 1,
      stripPng: encodePng(image),
      chromaKey: CHROMA,
      chromaGreenSpill: true
    });

    assert.equal(countInteriorTransparentPixels(processed), 0);
    assert.equal(processed.data[center + 3], 255);
    assert.equal(processed.data[center + 1], 80);
  });

  it("removes and repairs small pure-green islands enclosed by hair or limbs", () => {
    const image = blankImage(7, 7);
    drawRect(image, 1, 1, 5, 5, 40, 30, 20);
    const center = (3 * image.width + 3) * 4;
    image.data[center] = 0;
    image.data[center + 1] = 255;
    image.data[center + 2] = 0;
    image.data[center + 3] = 255;

    const processed = applyStripChromaPipeline(image, {
      rowIndex: 0,
      frameCount: 1,
      stripPng: encodePng(image),
      chromaKey: CHROMA,
      chromaGreenSpill: true
    });

    assert.equal(countInteriorTransparentPixels(processed), 0);
    assert.equal(processed.data[center + 3], 255);
    assert.ok((processed.data[center + 1] ?? 0) < 100);
  });
});

describe("validateAtlas half-body / scale-jump detection", () => {
  it("flags a row whose frames are mostly half-body (low aspect ratio)", () => {
    const grid = { columns: 8, rows: 2 };
    const frameCount = 4;
    const fullBodySlot = buildSlot(makeRowStrip(frameCount, 60, 150), frameCount, 0, "idle");
    const halfBodySlot = buildSlot(makeRowStrip(frameCount, 150, 60), frameCount, 1, "idle");

    const fullFrames = extractStripFrames(fullBodySlot, CELL);
    const halfFrames = extractStripFrames(halfBodySlot, CELL);

    const atlasPng = composeAtlas({
      cell: CELL,
      grid,
      rows: [
        { rowIndex: 0, framesPng: fullFrames.map((f) => f.png) },
        { rowIndex: 1, framesPng: halfFrames.map((f) => f.png) }
      ]
    });

    const report = validateAtlas({
      atlasPng,
      cell: CELL,
      grid,
      rowFrameCounts: { 0: frameCount, 1: frameCount }
    });

    assert.ok(report.failedRowIndices.includes(1), `expected row 1 (half-body) to be flagged, got ${JSON.stringify(report.failedRowIndices)}`);
  });
});

function opaqueBBoxHeight(img: ReturnType<typeof decodePng>): number {
  let minY = img.height;
  let maxY = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) === 0) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxY < minY ? 0 : maxY - minY + 1;
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
