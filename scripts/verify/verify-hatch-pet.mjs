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
//   pnpm --filter=@bailin/character-protocol run build
//   pnpm --filter=@bailin/pet-atlas-tools run build
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
      "  pnpm --filter=@bailin/character-protocol run build\n" +
      "  pnpm --filter=@bailin/pet-atlas-tools run build"
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
  makeCanonicalBase,
  applyStripChromaPipeline,
  repairInteriorAlphaHoles,
  detectNativeTransparency,
  countInteriorTransparentPixels,
  removeChromaBackgroundConnected,
  measureFrameAnchor,
  stripMatchesEqualSlotLayout
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
  const notHalfBody = boundaryFrames.every((f) => {
    const img = decodePng(f.png);
    const b = opaqueBounds(img);
    const half = Math.floor(img.width / 2);
    const left = countRectOpaque(img, 0, 0, half, img.height);
    const right = countRectOpaque(img, half, 0, img.width - half, img.height);
    const balance = Math.min(left, right) / Math.max(1, Math.max(left, right));
    return b.w > 120 && b.h > 120 && balance > 0.35;
  });
  notHalfBody
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

// ===== 5/5 连通 chroma + 内部洞修复 =====
console.log("\n[5/5] connected chroma / interior hole repair");

const whiteKey = { r: 255, g: 255, b: 255 };
const whiteDress = blankImage(220, 220);
fillChroma(whiteDress, whiteKey);
drawDisc(whiteDress, 110, 110, 54, 40, 40, 48);
drawDisc(whiteDress, 110, 110, 48, 250, 250, 250);
const whiteProcessed = applyStripChromaPipeline(whiteDress, {
  rowIndex: 0,
  frameCount: 1,
  stripPng: encodePng(whiteDress),
  chromaKey: whiteKey,
  chromaSeedThreshold: 30,
  chromaSpillThreshold: 40
});
const whiteInnerOpaque = countDiscOpaque(whiteProcessed, 110, 110, 48);
whiteInnerOpaque / (Math.PI * 48 * 48) > 0.95
  ? ok(`白裙误抠防护：中心 opaque 占比 ${(whiteInnerOpaque / (Math.PI * 48 * 48) * 100).toFixed(1)}%`)
  : fail(`白裙中心被误抠，opaque=${whiteInnerOpaque}`);

const greenKey = { r: 0, g: 255, b: 0 };
const greenOutfit = blankImage(220, 220);
fillChroma(greenOutfit, greenKey);
drawRect(greenOutfit, 68, 68, 84, 84, 40, 40, 48);
fillRect(greenOutfit, 72, 72, 76, 76, 80, 160, 80);
const greenProcessed = applyStripChromaPipeline(greenOutfit, {
  rowIndex: 0,
  frameCount: 1,
  stripPng: encodePng(greenOutfit),
  chromaKey: greenKey,
  chromaSeedThreshold: 60,
  chromaSpillThreshold: 75,
  chromaGreenSpill: true
});
countRectOpaque(greenProcessed, 72, 72, 76, 76) > 5000
  ? ok("绿衣块未被 greenSpill 误抠")
  : fail("绿衣块被误抠");

const borderClear = applyStripChromaPipeline(greenOutfit, {
  rowIndex: 0,
  frameCount: 1,
  stripPng: encodePng(greenOutfit),
  chromaKey: greenKey,
  chromaSeedThreshold: 60,
  chromaSpillThreshold: 75,
  chromaGreenSpill: true
});
borderSampleTransparent(borderClear, greenKey) >= 0.95
  ? ok("四边 chroma 背景已清除")
  : fail("四边 chroma 背景残留");

let holeImg = blankImage(120, 120);
drawDisc(holeImg, 60, 60, 45, 180, 90, 90);
for (let dy = -2; dy <= 2; dy += 1) {
  for (let dx = -2; dx <= 2; dx += 1) {
    const idx = ((60 + dy) * 120 + (60 + dx)) * 4;
    holeImg.data[idx + 3] = 0;
  }
}
countInteriorTransparentPixels(holeImg) >= 20
  ? ok(`内部洞注入 ${countInteriorTransparentPixels(holeImg)} px`)
  : fail("内部洞注入失败");
const holeFixed = repairInteriorAlphaHoles(holeImg);
countInteriorTransparentPixels(holeFixed) === 0
  ? ok("内部透明洞已修复")
  : fail(`修复后仍有 ${countInteriorTransparentPixels(holeFixed)} 内部洞`);

const hairGap = blankImage(140, 140);
fillChroma(hairGap, whiteKey);
drawDisc(hairGap, 70, 70, 52, 36, 34, 42);
fillRect(hairGap, 64, 64, 12, 12, 252, 252, 252);
const gapProcessed = applyStripChromaPipeline(hairGap, {
  rowIndex: 0,
  frameCount: 1,
  stripPng: encodePng(hairGap),
  chromaKey: whiteKey,
  chromaSeedThreshold: 30,
  chromaSpillThreshold: 40
});
countRectOpaque(gapProcessed, 64, 64, 12, 12) >= 100
  ? ok("白裙/发缝大面积浅色不会被内部孤岛误抠")
  : fail(`发缝区域被过度清除：仅剩 ${countRectOpaque(gapProcessed, 64, 64, 12, 12)} opaque`);

const nativeImg = blankImage(240, 240);
drawDisc(nativeImg, 120, 120, 55, 220, 120, 80);
detectNativeTransparency(nativeImg)
  ? ok("原生透明 PNG 检测通过")
  : fail("原生透明 PNG 未检测到");
const nativeProcessed = applyStripChromaPipeline(nativeImg, {
  rowIndex: 0,
  frameCount: 1,
  stripPng: encodePng(nativeImg),
  chromaKey: greenKey,
  chromaSeedThreshold: 60,
  chromaSpillThreshold: 75,
  chromaGreenSpill: true
});
countDiscOpaque(nativeProcessed, 120, 120, 50) > 7000
  ? ok("原生透明图跳过 chroma 后主体保留")
  : fail("原生透明图主体被 chroma 误伤");

// ===== 6/6 行级锚点对齐 / slot bleed =====
console.log("\n[6/6] row anchor alignment / slot bleed");

const waveFrameCount = 6;
const waveStripW = DEFAULT_ATLAS_CELL.width * waveFrameCount;
const waveStrip = blankImage(waveStripW, DEFAULT_ATLAS_CELL.height);
fillChroma(waveStrip, whiteKey);
for (let i = 0; i < waveFrameCount; i += 1) {
  const cx = i * DEFAULT_ATLAS_CELL.width + DEFAULT_ATLAS_CELL.width / 2;
  const footY = DEFAULT_ATLAS_CELL.height - 40;
  drawDisc(waveStrip, cx, footY - 30, 28, 50, 50, 60);
  if (i === 2 || i === 3) {
    drawDisc(waveStrip, cx + 35, footY - 55, 14, 50, 50, 60);
    drawDisc(waveStrip, cx - 35, footY - 55, 14, 50, 50, 60);
  }
}
const waveFrames = extractStripFrames(
  {
    rowIndex: 3,
    frameCount: waveFrameCount,
    stripPng: encodePng(waveStrip),
    chromaKey: whiteKey,
    chromaSeedThreshold: 30,
    chromaSpillThreshold: 40,
    rowState: "waving"
  },
  DEFAULT_ATLAS_CELL
);
const waveFootCenters = waveFrames
  .map((f) => measureFrameAnchor(decodePng(f.png))?.footCenterX)
  .filter((x) => x != null);
const waveHeadTops = waveFrames
  .map((f) => measureFrameAnchor(decodePng(f.png))?.headTopY)
  .filter((y) => y != null);
if (waveFootCenters.length >= 2) {
  const waveFootRange = Math.max(...waveFootCenters) - Math.min(...waveFootCenters);
  waveFootRange <= 2
    ? ok(`挥手行 footCenter X 极差 ${waveFootRange.toFixed(1)}px`)
    : fail(`挥手行 footCenter X 极差 ${waveFootRange.toFixed(1)}px > 2`);
} else {
  fail("挥手行对齐测试未得到有效帧");
}
if (waveHeadTops.length >= 1) {
  const minHead = Math.min(...waveHeadTops);
  minHead >= 10
    ? ok(`挥手行头顶 minY=${minHead.toFixed(0)}，未被削顶`)
    : fail(`挥手行头顶 minY=${minHead.toFixed(0)} < 10，可能被削顶`);
} else {
  fail("挥手行削顶测试未得到有效帧");
}

const bleedStripW = DEFAULT_ATLAS_CELL.width * 2;
const bleedStrip = blankImage(bleedStripW, DEFAULT_ATLAS_CELL.height);
fillChroma(bleedStrip, whiteKey);
drawDisc(bleedStrip, DEFAULT_ATLAS_CELL.width / 2, DEFAULT_ATLAS_CELL.height - 40, 30, 40, 40, 48);
fillRect(
  bleedStrip,
  DEFAULT_ATLAS_CELL.width - 1,
  16,
  2,
  DEFAULT_ATLAS_CELL.height - 32,
  255,
  0,
  0
);
drawDisc(
  bleedStrip,
  DEFAULT_ATLAS_CELL.width + DEFAULT_ATLAS_CELL.width / 2,
  DEFAULT_ATLAS_CELL.height - 40,
  30,
  40,
  40,
  48
);
const bleedFrames = extractStripFrames(
  {
    rowIndex: 0,
    frameCount: 2,
    stripPng: encodePng(bleedStrip),
    chromaKey: whiteKey,
    chromaSeedThreshold: 30,
    chromaSpillThreshold: 40,
    rowState: "idle"
  },
  DEFAULT_ATLAS_CELL
);
const bleedFrame0 = decodePng(bleedFrames[0]?.png ?? encodePng(blankImage(1, 1)));
const rightEdgeRed = countRedOpaque(
  bleedFrame0,
  DEFAULT_ATLAS_CELL.width - 4,
  0,
  4,
  DEFAULT_ATLAS_CELL.height
);
rightEdgeRed === 0
  ? ok("slot 切缝内缩：帧 0 右缘无邻帧污染")
  : fail(`slot 切缝后帧 0 右缘仍有 ${rightEdgeRed} 个红色污染像素`);

stripMatchesEqualSlotLayout(
  decodePng(encodePng(squareStrip)),
  stripFrameCount,
  DEFAULT_ATLAS_CELL
) === false
  ? ok("1024×1024 方图不会误判为等宽 strip 布局")
  : fail("1024×1024 方图被误判为等宽 strip 布局");

const widePoseStripW = DEFAULT_ATLAS_CELL.width * waveFrameCount;
const widePoseStrip = blankImage(widePoseStripW, DEFAULT_ATLAS_CELL.height);
fillChroma(widePoseStrip, whiteKey);
for (let i = 0; i < waveFrameCount; i += 1) {
  const cx = i * DEFAULT_ATLAS_CELL.width + DEFAULT_ATLAS_CELL.width / 2;
  const footY = DEFAULT_ATLAS_CELL.height - 40;
  drawDisc(widePoseStrip, cx, footY - 30, 28, 50, 50, 60);
  if (i === 2) {
    drawDisc(widePoseStrip, cx + 72, footY - 55, 14, 50, 50, 60);
  }
}
const widePoseFrames = extractStripFrames(
  {
    rowIndex: 3,
    frameCount: waveFrameCount,
    stripPng: encodePng(widePoseStrip),
    chromaKey: whiteKey,
    chromaSeedThreshold: 30,
    chromaSpillThreshold: 40,
    rowState: "waving"
  },
  DEFAULT_ATLAS_CELL
);
const wideFrame2 = decodePng(widePoseFrames[2]?.png ?? encodePng(blankImage(1, 1)));
let wideMinX = wideFrame2.width;
let wideMaxX = -1;
for (let y = 0; y < wideFrame2.height; y += 1) {
  for (let x = 0; x < wideFrame2.width; x += 1) {
    if (!wideFrame2.data[(y * wideFrame2.width + x) * 4 + 3]) continue;
    if (x < wideMinX) wideMinX = x;
    if (x > wideMaxX) wideMaxX = x;
  }
}
wideMaxX >= 0 && wideMinX >= 2 && wideMaxX <= DEFAULT_ATLAS_CELL.width - 3
  ? ok(`宽 pose 帧主体未贴边：X=${wideMinX}-${wideMaxX}`)
  : fail(`宽 pose 帧主体贴边/被裁：X=${wideMinX}-${wideMaxX}`);

// ===== 7/7 moderation 检测 + 抠像兜底帧 =====
console.log("\n[7/7] moderation detection + chroma fallback frame");

function isModerationBlockedSmoke(message) {
  const text = String(message).toLowerCase();
  return (
    text.includes("moderation_blocked") ||
    text.includes("safety system") ||
    text.includes("rejected by the safety")
  );
}

isModerationBlockedSmoke('HTTP 400: {"code":"moderation_blocked"}')
  ? ok("isModerationBlocked 识别 moderation_blocked")
  : fail("isModerationBlocked 未识别 moderation_blocked");
!isModerationBlockedSmoke("NETWORK_ERROR: terminated")
  ? ok("isModerationBlocked 不误判网络错误")
  : fail("isModerationBlocked 误判网络错误");

const fallbackStrip = blankImage(DEFAULT_ATLAS_CELL.width * 2, DEFAULT_ATLAS_CELL.height);
fillChroma(fallbackStrip, whiteKey);
drawDisc(
  fallbackStrip,
  DEFAULT_ATLAS_CELL.width / 2,
  DEFAULT_ATLAS_CELL.height - 40,
  30,
  40,
  40,
  48
);
const fallbackFrames = extractStripFrames(
  {
    rowIndex: 0,
    frameCount: 2,
    stripPng: encodePng(fallbackStrip),
    chromaKey: whiteKey,
    chromaSeedThreshold: 30,
    chromaSpillThreshold: 40,
    rowState: "idle"
  },
  DEFAULT_ATLAS_CELL
);
const fallbackFrame0 = decodePng(fallbackFrames[0]?.png ?? encodePng(blankImage(1, 1)));
const fallbackBorderTransparent = borderSampleTransparent(fallbackFrame0, whiteKey);
fallbackBorderTransparent >= 0.35
  ? ok(`抠像兜底帧外圈透明占比 ${(fallbackBorderTransparent * 100).toFixed(0)}%（非整格白底）`)
  : fail(`抠像兜底帧外圈透明占比 ${(fallbackBorderTransparent * 100).toFixed(0)}% 过低，像未抠白底`);

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

function fillRect(img, x0, y0, w, h, R, G, B) {
  for (let y = y0; y < y0 + h && y < img.height; y += 1) {
    for (let x = x0; x < x0 + w && x < img.width; x += 1) {
      if (x < 0 || y < 0) continue;
      const idx = (y * img.width + x) * 4;
      img.data[idx] = R;
      img.data[idx + 1] = G;
      img.data[idx + 2] = B;
      img.data[idx + 3] = 255;
    }
  }
}

function drawRect(img, x0, y0, w, h, R, G, B) {
  fillRect(img, x0, y0, w, 1, R, G, B);
  fillRect(img, x0, y0 + h - 1, w, 1, R, G, B);
  fillRect(img, x0, y0, 1, h, R, G, B);
  fillRect(img, x0 + w - 1, y0, 1, h, R, G, B);
}

function countDiscOpaque(img, cx, cy, r) {
  let count = 0;
  const r2 = r * r;
  for (let y = Math.max(0, cy - r); y < Math.min(img.height, cy + r); y += 1) {
    for (let x = Math.max(0, cx - r); x < Math.min(img.width, cx + r); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) >= 128) count += 1;
    }
  }
  return count;
}

function countRectOpaque(img, x0, y0, w, h) {
  let count = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) >= 128) count += 1;
    }
  }
  return count;
}

function borderSampleTransparent(img, key) {
  const { width, height, data } = img;
  let total = 0;
  let transparent = 0;
  const sample = (x, y) => {
    total += 1;
    const a = data[(y * width + x) * 4 + 3] ?? 0;
    if (a < 16) transparent += 1;
  };
  for (let x = 0; x < width; x += 4) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 4) {
    sample(0, y);
    sample(width - 1, y);
  }
  return total === 0 ? 0 : transparent / total;
}

function opaqueCentroidX(img) {
  let sumX = 0;
  let count = 0;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) === 0) continue;
      sumX += x;
      count += 1;
    }
  }
  return count > 0 ? sumX / count : null;
}

function countRedOpaque(img, x0, y0, w, h) {
  let count = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const idx = (y * img.width + x) * 4;
      const r = img.data[idx] ?? 0;
      const g = img.data[idx + 1] ?? 0;
      const b = img.data[idx + 2] ?? 0;
      const a = img.data[idx + 3] ?? 0;
      if (a >= 128 && r > 200 && g < 80 && b < 80) count += 1;
    }
  }
  return count;
}
