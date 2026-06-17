#!/usr/bin/env node
/* eslint-disable no-console */
// hatch-pet pipeline 端到端 smoke 测试。
//
// 覆盖：
//   1. SpriteProgram schema 接受 atlas 模式，且仍向后兼容 dsl
//   2. pet-atlas-tools 的 extract → compose → validate 在确定性输入下输出正确
//   3. defaultAtlasStateMachine / defaultAtlasStateBindings 对外行为
//   4. PNG IO 不丢透明像素
//
// 跑法（先 build 三个包）：
//   pnpm --filter=@nuwa-pet/character-protocol run build
//   pnpm --filter=@nuwa-pet/pet-atlas-tools run build
//   node scripts/verify/verify-hatch-pet.mjs

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
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
  atlasWalkLeftBinding,
  mergeAtlasRuntimeDefaults,
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
console.log("\n[1/5] SpriteProgram atlas schema");

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

const bindings = defaultAtlasStateBindings();
const hatchRowsUsed = new Set(
  Object.values(bindings).map((b) => b.hatchRow).filter(Boolean)
);
hatchRowsUsed.add(atlasWalkLeftBinding().hatchRow);
for (const row of HATCH_PET_ROW_STATES) {
  hatchRowsUsed.has(row)
    ? ok(`图集行 ${row} 已绑定到 SpriteState`)
    : fail(`图集行 ${row} 未绑定到任何 SpriteState`);
}

const sm = defaultAtlasStateMachine();
sm.states.sad && sm.states.work
  ? ok("状态机包含 sad / work 状态")
  : fail("状态机缺少 sad 或 work");

const merged = mergeAtlasRuntimeDefaults({
  ...atlasProgram.atlas,
  states: { idle: bindings.idle },
  stateMachine: { initial: "idle", states: { idle: sm.states.idle } }
});
merged.states.work && merged.states.sad
  ? ok("mergeAtlasRuntimeDefaults 补全旧 bundle 绑定")
  : fail("mergeAtlasRuntimeDefaults 未补全 work/sad");

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

// 真实 gpt-image 返回通常是 1024×1024 方图，不是理想的 1152×208 strip。
// extractStripFrames 必须能把方图按 frameCount 切槽并 fit 到 192×208 cell，
// 否则真实 row job 会全部裁帧失败，最终退回 CSS / base 重复帧。
const squareStrip = blankImage(1024, 1024);
fillChroma(squareStrip, chromaKey);
for (let i = 0; i < stripFrameCount; i += 1) {
  const slotW = squareStrip.width / stripFrameCount;
  const cx = Math.floor(i * slotW + slotW / 2);
  drawDisc(squareStrip, cx, 512, 80, 60 + i * 25, 120, 240 - i * 20);
}
try {
  const squareFrames = extractStripFrames(
    {
      rowIndex: 0,
      frameCount: stripFrameCount,
      stripPng: encodePng(squareStrip),
      chromaKey,
      chromaThreshold: 60
    },
    cell
  );
  squareFrames.length === stripFrameCount &&
  squareFrames.every((f) => decodePng(f.png).width === cell.width && decodePng(f.png).height === cell.height) &&
  squareFrames.every((f) => f.opaquePixelCount > 2000)
    ? ok("1024×1024 方图条带可裁成 cell 帧")
    : fail("1024×1024 方图条带裁帧结果尺寸 / 内容占比异常");
} catch (e) {
  fail(`1024×1024 方图条带裁帧抛错：${e.message}`);
}

// 模型常把每个角色画在 slot 边界附近；等宽切割会把角色切成左右半身。
// component/range 裁切应能先找完整角色块，再 fit 到 cell。
const boundaryStrip = blankImage(1024, 1024);
fillChroma(boundaryStrip, chromaKey);
for (let i = 0; i < stripFrameCount; i += 1) {
  const slotW = boundaryStrip.width / stripFrameCount;
  const cx = Math.floor(i * slotW + slotW - 42);
  drawDisc(boundaryStrip, cx, 512, 50, 200, 80 + i * 20, 80);
}
try {
  const boundaryFrames = extractStripFrames(
    {
      rowIndex: 0,
      frameCount: stripFrameCount,
      stripPng: encodePng(boundaryStrip),
      chromaKey,
      chromaThreshold: 60
    },
    cell
  );
  const widths = boundaryFrames.map((f) => opaqueBounds(decodePng(f.png)).w);
  widths.every((w) => w > 150)
    ? ok("跨 slot 边界的角色不会被切成半身")
    : fail(`跨 slot 边界角色有效宽度异常：${widths.join(", ")}`);
} catch (e) {
  fail(`跨 slot 边界裁帧抛错：${e.message}`);
}

// 真实 raw-row 形态：方图里只有 2~3 个完整角色，两侧还有半身。
// 期望：提取完整角色并重采样到目标帧数，绝不回退等宽切出半身。
const sparseStrip = blankImage(1024, 1024);
fillChroma(sparseStrip, chromaKey);
drawDisc(sparseStrip, -20, 512, 85, 220, 120, 40);   // 左侧半身
drawDisc(sparseStrip, 260, 512, 85, 220, 120, 40);   // 完整
drawDisc(sparseStrip, 540, 512, 85, 180, 180, 60);   // 完整
drawDisc(sparseStrip, 820, 512, 85, 120, 200, 90);   // 完整
drawDisc(sparseStrip, 1040, 512, 85, 220, 120, 40);  // 右侧半身
try {
  const sparseFrames = extractStripFrames(
    {
      rowIndex: 0,
      frameCount: stripFrameCount,
      stripPng: encodePng(sparseStrip),
      chromaKey,
      chromaThreshold: 60
    },
    cell
  );
  const widths = sparseFrames.map((f) => opaqueBounds(decodePng(f.png)).w);
  const okSparse =
    sparseFrames.length === stripFrameCount &&
    widths.every((w) => w > 150) &&
    sparseFrames.every((f) => f.opaquePixelCount > 2000);
  okSparse
    ? ok("稀疏方图可用完整组件重采样，不会切出边缘半身")
    : fail(`稀疏方图组件重采样失败：widths=${widths.join(", ")} pixels=${sparseFrames.map((f) => f.opaquePixelCount).join(", ")}`);
} catch (e) {
  fail(`稀疏方图裁帧抛错：${e.message}`);
}

// 另一类真实 gpt-image 输出：2×3 网格。只按 x 投影会把上下两个角色合成一个高块，
// 再 fit 到 192×208 时变成窄条。2D 连通域应能分开上下组件。
const gridStrip = blankImage(1024, 1024);
fillChroma(gridStrip, chromaKey);
const xs = [230, 512, 794];
const ys = [330, 700];
for (const y of ys) {
  for (const x of xs) {
    drawDisc(gridStrip, x, y, 58, 90 + (x % 100), 130 + (y % 80), 200);
  }
}
try {
  const gridFrames = extractStripFrames(
    {
      rowIndex: 0,
      frameCount: stripFrameCount,
      stripPng: encodePng(gridStrip),
      chromaKey,
      chromaThreshold: 60
    },
    cell
  );
  const widths = gridFrames.map((f) => opaqueBounds(decodePng(f.png)).w);
  const okGrid =
    gridFrames.length === stripFrameCount &&
    widths.every((w) => w > 150) &&
    gridFrames.every((f) => f.opaquePixelCount > 2000);
  okGrid
    ? ok("2×3 网格输出可按独立角色组件裁帧")
    : fail(`2×3 网格裁帧异常：widths=${widths.join(", ")} pixels=${gridFrames.map((f) => f.opaquePixelCount).join(", ")}`);
} catch (e) {
  fail(`2×3 网格裁帧抛错：${e.message}`);
}

// 只有一个完整角色 + 两侧半身时，也应重复中间完整角色，而不是回退 slot。
const singleFullStrip = blankImage(1024, 1024);
fillChroma(singleFullStrip, chromaKey);
drawDisc(singleFullStrip, -30, 512, 85, 220, 120, 40);
drawDisc(singleFullStrip, 512, 512, 85, 80, 190, 210);
drawDisc(singleFullStrip, 1050, 512, 85, 220, 120, 40);
try {
  const singleFrames = extractStripFrames(
    {
      rowIndex: 0,
      frameCount: stripFrameCount,
      stripPng: encodePng(singleFullStrip),
      chromaKey,
      chromaThreshold: 60
    },
    cell
  );
  const widths = singleFrames.map((f) => opaqueBounds(decodePng(f.png)).w);
  const okSingle =
    singleFrames.length === stripFrameCount &&
    widths.every((w) => w > 150) &&
    singleFrames.every((f) => f.opaquePixelCount > 2000);
  okSingle
    ? ok("单个完整组件会重复成目标帧数，不会回退半身 slot")
    : fail(`单完整组件裁帧异常：widths=${widths.join(", ")} pixels=${singleFrames.map((f) => f.opaquePixelCount).join(", ")}`);
} catch (e) {
  fail(`单完整组件裁帧抛错：${e.message}`);
}

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

function opaqueBounds(img) {
  let minX = img.width;
  let maxX = -1;
  let minY = img.height;
  let maxY = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const a = img.data[(y * img.width + x) * 4 + 3];
      if (!a) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return { w: 0, h: 0 };
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}
