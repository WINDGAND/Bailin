#!/usr/bin/env node
/* eslint-disable no-console */
// hatch-pet pipeline 端到端 smoke 测试。
//
// 覆盖：
//   1. SpriteProgram schema 接受 atlas 模式，且仍向后兼容 dsl / layered-css
//   2. pet-atlas-tools 的 extract → compose → validate 在确定性输入下输出正确
//   3. defaultAtlasStateMachine / defaultAtlasStateBindings 对外行为
//   4. PNG IO 不丢透明像素
//
// 跑法（先 build 三个包）：
//   pnpm --filter=@nuwa-pet/character-protocol run build
//   pnpm --filter=@nuwa-pet/pet-atlas-tools run build
//   node scripts/verify-hatch-pet.mjs

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const protocolPath = resolve(repoRoot, "packages/character-protocol/dist/index.cjs");
const toolsPath = resolve(repoRoot, "packages/pet-atlas-tools/dist/index.cjs");

if (!existsSync(protocolPath) || !existsSync(toolsPath)) {
  console.error(
    "[verify-hatch-pet] 缺少 dist 产物；请先：\n" +
      "  pnpm --filter=@nuwa-pet/character-protocol run build\n" +
      "  pnpm --filter=@nuwa-pet/pet-atlas-tools run build"
  );
  process.exit(2);
}

const {
  parseSprite,
  defaultAtlasStateBindings,
  defaultAtlasStateMachine,
  DEFAULT_ATLAS_CELL,
  DEFAULT_ATLAS_GRID,
  DEFAULT_ROW_FRAME_COUNTS,
  HATCH_PET_ROW_STATES
} = require(protocolPath);
const {
  composeAtlas,
  extractStripFrames,
  encodePng,
  decodePng,
  blankImage,
  makeLayoutGuide,
  mirrorStripHorizontally,
  validateAtlas,
  makeContactSheet,
  makeCanonicalBase
} = require(toolsPath);

let allOk = true;
const fail = (msg) => {
  allOk = false;
  console.log(`  FAIL ${msg}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);

// ===== 1. SpriteProgram schema =====
console.log("\n[1/4] SpriteProgram atlas schema");

const dummyAtlasPng = makeCheckerboard(
  DEFAULT_ATLAS_CELL.width * DEFAULT_ATLAS_GRID.columns,
  DEFAULT_ATLAS_CELL.height * DEFAULT_ATLAS_GRID.rows
);

const atlasProgram = {
  schemaVersion: "0.1",
  mode: "atlas",
  size: { width: DEFAULT_ATLAS_CELL.width, height: DEFAULT_ATLAS_CELL.height },
  displayScale: 1,
  palette: [
    { name: "outline", hex: "#1a1a2e" },
    { name: "skin", hex: "#f3d3b1" }
  ],
  atlas: {
    spritesheetUrl: `data:image/png;base64,${dummyAtlasPng.toString("base64")}`,
    imageFormat: "png",
    cell: DEFAULT_ATLAS_CELL,
    grid: DEFAULT_ATLAS_GRID,
    states: defaultAtlasStateBindings(),
    stateMachine: defaultAtlasStateMachine(),
    hatchRunId: "verify-001"
  }
};

const parsed = parseSprite(atlasProgram);
parsed.ok ? ok("atlas SpriteProgram 校验通过") : fail(
  `atlas 校验失败: ${(parsed.errors ?? []).map((e) => `${e.path}=${e.message}`).join(" | ")}`
);

// 老 dsl 仍然可解析
const dslSkeleton = {
  schemaVersion: "0.1",
  mode: "dsl",
  size: { width: 32, height: 32 },
  displayScale: 4,
  palette: [
    { name: "outline", hex: "#1f2933" },
    { name: "skin", hex: "#f3d3b1" }
  ],
  dsl: {
    parts: [
      { id: "body", z: 0, shapes: [{ type: "rect", x: 0, y: 0, w: 4, h: 4, paletteIndex: 0 }] }
    ],
    animations: {
      idle: { fps: 4, loop: true, frames: [{ duration: 4, transforms: [] }] }
    },
    stateMachine: {
      initial: "idle",
      states: { idle: { animation: "idle", transitions: [] } }
    }
  }
};
const parsedDsl = parseSprite(dslSkeleton);
parsedDsl.ok ? ok("旧 dsl 模式仍兼容") : fail("dsl 模式校验回归");

// ===== 2. extract → compose → validate =====
console.log("\n[2/4] extract → compose → validate");

const cell = DEFAULT_ATLAS_CELL;
const grid = DEFAULT_ATLAS_GRID;

// 构造一行 6 帧 strip：6 个色块各占一格，背景设为 chroma green
const chromaKey = { r: 0, g: 255, b: 0 };
const stripFrameCount = DEFAULT_ROW_FRAME_COUNTS.idle;
const strip = blankImage(cell.width * stripFrameCount, cell.height);
fillChroma(strip, chromaKey);
for (let i = 0; i < stripFrameCount; i += 1) {
  const cx = i * cell.width + Math.floor(cell.width / 2);
  const cy = Math.floor(cell.height / 2);
  drawDisc(strip, cx, cy, 30, 240 - i * 30, 90 + i * 25, 60 + i * 15);
}
const stripPng = encodePng(strip);

const frames = extractStripFrames(
  {
    rowIndex: 0,
    frameCount: stripFrameCount,
    stripPng,
    chromaKey,
    chromaThreshold: 60
  },
  cell
);

frames.length === stripFrameCount
  ? ok(`裁出 ${frames.length} 帧`)
  : fail(`裁帧数量错误：${frames.length} ≠ ${stripFrameCount}`);

const firstFrame = decodePng(frames[0].png);
firstFrame.width === cell.width && firstFrame.height === cell.height
  ? ok("帧尺寸 = cell")
  : fail(`帧尺寸 ${firstFrame.width}×${firstFrame.height} ≠ ${cell.width}×${cell.height}`);

frames[0].opaquePixelCount > 100
  ? ok(`帧 0 非透明像素 = ${frames[0].opaquePixelCount}`)
  : fail(`帧 0 几乎全透明: ${frames[0].opaquePixelCount}`);

// compose
const composeRows = HATCH_PET_ROW_STATES.map((state, idx) => ({
  rowIndex: idx,
  framesPng: idx === 0 ? frames.map((f) => f.png) : []
}));
const atlasPng = composeAtlas({ cell, grid, rows: composeRows });

const atlasImg = decodePng(atlasPng);
const expectedW = cell.width * grid.columns;
const expectedH = cell.height * grid.rows;
atlasImg.width === expectedW && atlasImg.height === expectedH
  ? ok(`atlas 尺寸 = ${expectedW}×${expectedH}`)
  : fail(`atlas 尺寸不对：${atlasImg.width}×${atlasImg.height}`);

// validate
const rowFrameCounts = { 0: stripFrameCount };
const report = validateAtlas({
  atlasPng,
  cell,
  grid,
  rowFrameCounts
});
report.sizeOk ? ok("atlas 尺寸校验通过") : fail("atlas 尺寸校验失败");
report.trailingTransparent
  ? ok("未使用格子完全透明")
  : fail("未使用格子残留像素");

// ===== 3. mirror strip =====
console.log("\n[3/4] mirrorStripHorizontally");
const mirrored = mirrorStripHorizontally({
  stripPng,
  frameCount: stripFrameCount,
  cell
});
const mirroredImg = decodePng(mirrored);
mirroredImg.width === strip.width && mirroredImg.height === strip.height
  ? ok("镜像 strip 尺寸保持")
  : fail("镜像后尺寸变了");

// ===== 4. layout guide / contact sheet =====
console.log("\n[4/4] layout guide / contact sheet");
const guidePng = makeLayoutGuide({ frameCount: stripFrameCount, cell });
const guideImg = decodePng(guidePng);
guideImg.width === cell.width * stripFrameCount && guideImg.height === cell.height
  ? ok("layout guide 尺寸正确")
  : fail("layout guide 尺寸错误");

const sheetPng = makeContactSheet({
  rows: [
    { label: "idle", framesPng: frames.map((f) => f.png) }
  ],
  thumbCell: { width: Math.round(cell.width * 0.4), height: Math.round(cell.height * 0.4) },
  gap: 4
});
const sheetImg = decodePng(sheetPng);
sheetImg.width > 0 && sheetImg.height > 0
  ? ok("contact sheet 输出正常")
  : fail("contact sheet 输出尺寸异常");

// canonical base resize
const baseSrc = makeCheckerboard(512, 640);
const canonical = makeCanonicalBase({ imagePng: baseSrc, cell });
const canImg = decodePng(canonical);
canImg.width === cell.width && canImg.height === cell.height
  ? ok("makeCanonicalBase 缩放到 cell 成功")
  : fail("makeCanonicalBase 缩放错误");

// ===== 写出样例资产，便于人工肉眼检查 =====
const outDir = resolve(repoRoot, ".smoke-out", "hatch-pet");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "strip.png"), stripPng);
writeFileSync(resolve(outDir, "strip-mirrored.png"), mirrored);
writeFileSync(resolve(outDir, "atlas.png"), atlasPng);
writeFileSync(resolve(outDir, "layout-guide.png"), guidePng);
writeFileSync(resolve(outDir, "contact-sheet.png"), sheetPng);
writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
ok(`样例资产已写到 ${outDir}`);

if (!allOk) {
  console.log("\n[verify-hatch-pet] FAIL");
  process.exit(1);
}
console.log("\n[verify-hatch-pet] OK");

// ===== helpers =====

function fillChroma(img, c) {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = c.r;
    img.data[i + 1] = c.g;
    img.data[i + 2] = c.b;
    img.data[i + 3] = 255;
  }
}

function drawDisc(img, cx, cy, r, R, G, B) {
  const r2 = r * r;
  for (let y = Math.max(0, cy - r); y < Math.min(img.height, cy + r); y += 1) {
    for (let x = Math.max(0, cx - r); x < Math.min(img.width, cx + r); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        const idx = (y * img.width + x) * 4;
        img.data[idx] = R;
        img.data[idx + 1] = G;
        img.data[idx + 2] = B;
        img.data[idx + 3] = 255;
      }
    }
  }
}

function makeCheckerboard(w, h) {
  const img = blankImage(w, h);
  const tile = 16;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      const dark = ((Math.floor(x / tile) + Math.floor(y / tile)) & 1) === 0;
      img.data[idx] = dark ? 80 : 200;
      img.data[idx + 1] = dark ? 80 : 200;
      img.data[idx + 2] = dark ? 80 : 200;
      img.data[idx + 3] = 255;
    }
  }
  return encodePng(img);
}
