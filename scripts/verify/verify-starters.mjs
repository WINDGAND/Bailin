#!/usr/bin/env node
// 验证 starter sprite（若有）+ sprite-builder 程序化生成的 sprite 都符合：
//   - schema 通过
//   - 画布 96×96 @2x
//   - parts ≥ 10
//   - shapes ≥ 50（保证细节量）
//   - palette = 16
//   - animations 至少含 idle / idle-blink / walk-left / walk-right / talk /
//     think / sleep / click-reaction / drag / signature / fidget-a / fidget-b
//
// 跑法（必须先 build:main）：
//   pnpm --filter=./apps/desktop run build:main
//   node scripts/verify/verify-starters.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const starterPath = resolve(repoRoot, "apps/desktop/dist/main/shared/starters.js");
const builderPath = resolve(
  repoRoot,
  "apps/desktop/dist/main/main/runtime/sprite-builder.js"
);
const protocolPath = resolve(repoRoot, "packages/character-protocol/dist/index.cjs");

const { STARTER_BUNDLES } = require(starterPath);
const { buildSpriteFromAppearance } = require(builderPath);
const { parseSprite } = require(protocolPath);

const REQUIRED_ANIMS = [
  "idle",
  "idle-blink",
  "walk-left",
  "walk-right",
  "talk",
  "think",
  "sleep",
  "click-reaction",
  "drag",
  "signature",
  "fidget-a",
  "fidget-b"
];

function inspectSprite(label, sprite) {
  const parsed = parseSprite(sprite);
  const partsCount = sprite.dsl?.parts.length ?? 0;
  const shapesCount = (sprite.dsl?.parts ?? []).reduce(
    (acc, p) => acc + (p.shapes?.length ?? 0),
    0
  );
  const animsKeys = Object.keys(sprite.dsl?.animations ?? {});
  const missingAnims = REQUIRED_ANIMS.filter((a) => !animsKeys.includes(a));
  const size = `${sprite.size?.width}×${sprite.size?.height}@${sprite.displayScale}x`;
  const paletteSize = sprite.palette?.length ?? 0;

  const failures = [];
  if (!parsed.ok) failures.push(`schema invalid`);
  if (sprite.size.width !== 96 || sprite.size.height !== 96) failures.push(`size != 96×96`);
  if (sprite.displayScale !== 2) failures.push(`displayScale != 2`);
  if (partsCount < 10) failures.push(`parts < 10 (got ${partsCount})`);
  if (shapesCount < 50) failures.push(`shapes < 50 (got ${shapesCount})`);
  if (missingAnims.length > 0) failures.push(`missing anims: ${missingAnims.join(",")}`);
  if (paletteSize < 12 || paletteSize > 16) failures.push(`palette out of [12,16] (got ${paletteSize})`);

  const status = failures.length === 0 ? "OK" : "FAIL";
  console.log(
    `[${status}] ${label.padEnd(28)} · ${size} parts=${partsCount} shapes=${shapesCount} anims=${animsKeys.length} palette=${paletteSize}`
  );
  if (failures.length > 0) {
    for (const f of failures) console.log(`     - ${f}`);
    if (!parsed.ok) {
      for (const e of parsed.errors ?? []) {
        console.log(`     - ${e.path}: ${e.message}`);
      }
    }
  }
  return failures.length === 0;
}

let allOk = true;

console.log("=== Starter sprites (手工高精度版) ===");
if (STARTER_BUNDLES.length === 0) {
  console.log("(无内置 starter，跳过)");
} else {
  for (const bundle of STARTER_BUNDLES) {
    const ok = inspectSprite(bundle.card.meta.name, bundle.sprite);
    if (!ok) allOk = false;
  }
}

console.log("\n=== sprite-builder 程序化生成（LLM 造人路径） ===");
const mockAppearances = [
  {
    name: "蔡徐坤（短发 / T 恤）",
    spec: {
      schemaVersion: "0.1",
      build: "slim",
      ageBand: "young-adult",
      faceShape: "瓜子脸",
      skinTone: { name: "白皙", hex: "#f3d3b1" },
      hair: { style: "黑色短发", color: { name: "黑色", hex: "#1a1a1a" } },
      eyes: { color: { name: "棕色", hex: "#3b2614" }, shape: "细长", expression: "温和" },
      facialFeatures: [],
      outfit: {
        iconic: false,
        top: { name: "白色 T 恤", color: { name: "白色", hex: "#f5efe2" }, details: [] },
        bottom: { name: "黑色长裤", color: { name: "黑色", hex: "#1a1a1a" }, details: [] },
        footwear: { name: "白色运动鞋", color: { name: "白色", hex: "#e7e3c8" }, details: [] },
        accessories: [
          { name: "胸口 logo", placement: "胸前", color: { name: "黑色", hex: "#1a1a1a" }, signature: true }
        ]
      },
      gear: [],
      palette: [
        { role: "outline", hex: "#0d0d0d" },
        { role: "skin", hex: "#f3d3b1" },
        { role: "hair", hex: "#1a1a1a" },
        { role: "shirt", hex: "#f5efe2" },
        { role: "pants", hex: "#1a1a1a" },
        { role: "accent", hex: "#d99a3a" }
      ],
      styleTokens: ["年轻", "时尚"],
      typicalScene: "舞台",
      sourceConfidence: "medium",
      citationNotes: []
    }
  },
  {
    name: "测试 · 长脸 / 西装 / 眼镜 / 中年",
    spec: {
      schemaVersion: "0.1",
      build: "average",
      ageBand: "middle-age",
      faceShape: "长脸",
      skinTone: { name: "黄皮", hex: "#e8c4a0" },
      hair: { style: "短发 微秃", color: { name: "黑色", hex: "#1a1a1a" } },
      eyes: { color: { name: "黑色", hex: "#1a1a1a" }, shape: "细长", expression: "专注" },
      facialFeatures: [],
      outfit: {
        iconic: true,
        top: { name: "深蓝西装", color: { name: "深蓝", hex: "#243a5e" }, details: [] },
        bottom: { name: "黑色西裤", color: { name: "黑色", hex: "#1a1a1a" }, details: [] },
        footwear: { name: "黑色皮鞋", color: { name: "黑色", hex: "#0a0a0a" }, details: [] },
        accessories: [
          { name: "黑框眼镜", placement: "面部", color: { name: "黑色", hex: "#0a0a0a" }, signature: false },
          { name: "红色领带", placement: "颈部", color: { name: "红色", hex: "#b41e2f" }, signature: true }
        ]
      },
      gear: [],
      palette: [
        { role: "outline", hex: "#0a0a0a" },
        { role: "skin", hex: "#e8c4a0" },
        { role: "hair", hex: "#1a1a1a" },
        { role: "shirt", hex: "#243a5e" },
        { role: "pants", hex: "#1a1a1a" },
        { role: "accent", hex: "#d99a3a" },
        { role: "signature", hex: "#b41e2f" }
      ],
      styleTokens: ["职业", "教育"],
      typicalScene: "讲台",
      sourceConfidence: "high",
      citationNotes: []
    }
  },
  {
    name: "测试 · 圆脸 / 球衣 / 长发 / 笑容",
    spec: {
      schemaVersion: "0.1",
      build: "muscular",
      ageBand: "young-adult",
      faceShape: "圆脸",
      skinTone: { name: "深褐", hex: "#9c6a3e" },
      hair: { style: "黑色中长马尾", color: { name: "黑色", hex: "#0a0a0a" } },
      eyes: { color: { name: "棕色", hex: "#3b2614" }, shape: "圆", expression: "笑容" },
      facialFeatures: [],
      outfit: {
        iconic: true,
        top: { name: "紫色球衣 24 号", color: { name: "紫色", hex: "#552583" }, details: [] },
        bottom: { name: "短裤", color: { name: "紫色", hex: "#552583" }, details: [] },
        footwear: { name: "球鞋", color: { name: "白色", hex: "#f5efe2" }, details: [] },
        accessories: [
          { name: "24 号", placement: "胸前", color: { name: "金色", hex: "#fdb927" }, signature: true }
        ]
      },
      gear: [],
      palette: [
        { role: "outline", hex: "#0a0a0a" },
        { role: "skin", hex: "#9c6a3e" },
        { role: "hair", hex: "#0a0a0a" },
        { role: "shirt", hex: "#552583" },
        { role: "pants", hex: "#552583" },
        { role: "accent", hex: "#fdb927" },
        { role: "signature", hex: "#fdb927" }
      ],
      styleTokens: ["篮球", "运动", "球衣"],
      typicalScene: "球场",
      sourceConfidence: "high",
      citationNotes: []
    }
  }
];

for (const { name, spec } of mockAppearances) {
  const sprite = buildSpriteFromAppearance(spec);
  const ok = inspectSprite(name, sprite);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log("\n⚠ 至少有一个 sprite 不达标");
  process.exit(1);
}
console.log("\nAll sprites pass.");
