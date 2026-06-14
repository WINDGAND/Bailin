#!/usr/bin/env node
/**
 * Regression checks for the reference-driven layered pet renderer.
 *
 * This script intentionally checks the user-visible failure mode:
 * a user-provided reference image must not collapse into the old generic pet.
 * It must become a multi-layer, independently animatable visual program.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const builderPath = resolve(
  repoRoot,
  "apps/desktop/dist/main/main/runtime/layered-pet-builder.js"
);
const protocolPath = resolve(repoRoot, "packages/character-protocol/dist/index.cjs");

const { buildLayeredPetFromAppearance } = require(builderPath);
const { parseSprite } = require(protocolPath);

const refUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="220" viewBox="0 0 160 220">
      <rect width="160" height="220" fill="#101827"/>
      <ellipse cx="80" cy="58" rx="34" ry="38" fill="#f7d9c8"/>
      <path d="M42 52 C50 8,110 8,118 52 L111 80 C91 68,68 68,49 80 Z" fill="#39c5bb"/>
      <circle cx="66" cy="58" r="8" fill="#32b7ff"/>
      <circle cx="94" cy="58" r="8" fill="#32b7ff"/>
      <path d="M58 102 H102 L118 168 H42 Z" fill="#606775"/>
      <path d="M75 102 L85 102 L92 154 L80 168 L68 154 Z" fill="#39c5bb"/>
      <path d="M42 62 C14 94,20 170,34 206" stroke="#39c5bb" stroke-width="18" fill="none"/>
      <path d="M118 62 C146 94,140 170,126 206" stroke="#39c5bb" stroke-width="18" fill="none"/>
    </svg>`
  );

const appearance = {
  schemaVersion: "0.1",
  gender: "female",
  animeStyle: "chibi",
  build: "slim",
  ageBand: "teen",
  faceShape: "圆脸",
  skinTone: { name: "白皙", hex: "#fde8d8" },
  hair: { style: "青绿色双马尾", color: { name: "葱绿", hex: "#39c5bb" } },
  eyes: {
    color: { name: "蓝绿", hex: "#39c5bb" },
    shape: "大眼水汪汪",
    expression: "开心"
  },
  facialFeatures: ["腮红"],
  outfit: {
    iconic: true,
    top: {
      name: "灰色无袖衬衫",
      color: { name: "灰", hex: "#6b7280" },
      details: ["蓝绿色领带"]
    },
    bottom: {
      name: "深灰短裙",
      color: { name: "深灰", hex: "#4b5563" },
      details: []
    },
    accessories: [
      {
        name: "蓝绿领带",
        placement: "胸前",
        color: { name: "蓝绿", hex: "#39c5bb" },
        signature: true
      }
    ]
  },
  gear: [],
  palette: [
    { role: "skin", hex: "#fde8d8" },
    { role: "hair", hex: "#39c5bb" },
    { role: "shirt", hex: "#6b7280" },
    { role: "eye", hex: "#39c5bb" }
  ],
  styleTokens: ["偶像", "双马尾", "舞台"],
  typicalScene: "舞台",
  sourceConfidence: "high",
  citationNotes: [],
  referenceImages: []
};

const sprite = buildLayeredPetFromAppearance({
  characterName: "初音未来",
  appearance,
  referenceImages: [{ url: refUrl, source: "user-upload", role: "primary" }],
  rigHints: {
    characterBounds: { x: 0.08, y: 0.02, w: 0.84, h: 0.95 },
    leftEye: { x: 0.41, y: 0.28, size: 12 },
    rightEye: { x: 0.59, y: 0.28, size: 12 },
    signature: "sparkle"
  }
});

const parsed = parseSprite(sprite);
if (!parsed.ok) {
  console.error("Sprite schema failed:", parsed.errors);
  process.exit(1);
}

const layered = parsed.data.layered;
const imageLayers = layered.layers.filter((l) => l.type === "image");
const bones = new Set(imageLayers.map((l) => l.bone));
const cropped = imageLayers.filter((l) => l.crop);

const failures = [];
if (parsed.data.mode !== "layered-css") failures.push("mode must be layered-css");
if (layered.primarySource !== "reference") failures.push("primarySource must be reference");
if (imageLayers.length < 4) {
  failures.push(`reference mode must create >=4 image layers, got ${imageLayers.length}`);
}
for (const bone of ["body", "head", "hair-front", "outfit"]) {
  if (!bones.has(bone)) failures.push(`missing independently animatable ${bone} image layer`);
}
if (cropped.length < 3) failures.push(`expected cropped reference layers, got ${cropped.length}`);
if (layered.rig.leftEye?.x !== 0.41 || layered.rig.rightEye?.x !== 0.59) {
  failures.push("vision rig hints must be preserved in output");
}
if (layered.signature !== "sparkle") failures.push("signature hint must be preserved");

if (failures.length > 0) {
  console.error("Layered pet regression failed:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(
  `OK layered reference pet: imageLayers=${imageLayers.length}, cropped=${cropped.length}, bones=${[
    ...bones
  ].join(",")}`
);
