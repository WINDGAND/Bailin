#!/usr/bin/env node
/**
 * 验证 layered-pet-builder 输出是否通过 SpriteProgramSchema（mode=layered-css）。
 * 不调用 LLM。
 *
 * 跑法：
 *   pnpm --filter @nuwa-pet/character-protocol run build
 *   pnpm --filter ./apps/desktop run build:main
 *   node scripts/verify-layered-pet-builder.mjs
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
const protocolPath = resolve(
  repoRoot,
  "packages/character-protocol/dist/index.cjs"
);

const { buildLayeredPetFromAppearance } = require(builderPath);
const { parseSprite } = require(protocolPath);

const REF_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160" viewBox="0 0 120 160">
      <ellipse cx="60" cy="48" rx="28" ry="32" fill="#f3d3b1"/>
      <ellipse cx="60" cy="110" rx="34" ry="42" fill="#3d5a80"/>
      <circle cx="48" cy="46" r="5" fill="#3aa0e0"/>
      <circle cx="72" cy="46" r="5" fill="#3aa0e0"/>
    </svg>`
  );

const cases = [
  {
    name: "参考图分层（薇尔莉特风格）",
    input: {
      characterName: "薇尔莉特",
      appearance: {
        schemaVersion: "0.1",
        gender: "female",
        animeStyle: "anime-shoujo",
        build: "slim",
        ageBand: "teen",
        faceShape: "瓜子脸",
        skinTone: { name: "白皙", hex: "#f3d3b1" },
        hair: {
          style: "金色齐肩侧编发",
          color: { name: "金色", hex: "#f0d28a" }
        },
        eyes: {
          color: { name: "蓝绿", hex: "#3da26e" },
          shape: "大眼",
          expression: "温和"
        },
        facialFeatures: ["腮红"],
        outfit: {
          iconic: true,
          top: {
            name: "蓝色军装外套",
            color: { name: "蓝", hex: "#2e4b78" },
            details: ["白色高领"]
          },
          bottom: {
            name: "米色长裙",
            color: { name: "米", hex: "#d8c9a8" },
            details: []
          },
          accessories: [
            {
              name: "翡翠胸针",
              placement: "胸前",
              color: { name: "翡翠", hex: "#3da26e" },
              signature: true
            }
          ]
        },
        gear: [{ name: "机械义肢", placement: "双手", description: "金属手" }],
        palette: [
          { role: "skin", hex: "#f3d3b1" },
          { role: "hair", hex: "#f0d28a" },
          { role: "shirt", hex: "#2e4b78" },
          { role: "eye", hex: "#3da26e" }
        ],
        styleTokens: ["军装", "庄重"],
        typicalScene: "邮政公司",
        sourceConfidence: "high",
        citationNotes: ["测试"],
        referenceImages: []
      },
      referenceImages: [
        { url: REF_URL, source: "user-upload", role: "primary" }
      ]
    }
  },
  {
    name: "无参考图 CSS 插画（懂王）",
    input: {
      characterName: "特朗普",
      appearance: {
        schemaVersion: "0.1",
        gender: "male",
        animeStyle: "realistic",
        build: "stocky",
        ageBand: "elder",
        faceShape: "国字脸",
        skinTone: { name: "偏白", hex: "#f0c8a8" },
        hair: {
          style: "金色梳背",
          color: { name: "金色", hex: "#f0d060" }
        },
        eyes: {
          color: { name: "蓝", hex: "#3aa0e0" },
          shape: "细长",
          expression: "自信"
        },
        facialFeatures: [],
        outfit: {
          iconic: true,
          top: {
            name: "深蓝西装",
            color: { name: "深蓝", hex: "#1a2a5a" },
            details: []
          },
          accessories: [
            {
              name: "红蓝拼色领带",
              placement: "胸前",
              color: { name: "红蓝", hex: "#b41e2f" },
              signature: true
            }
          ]
        },
        gear: [],
        palette: [
          { role: "skin", hex: "#f0c8a8" },
          { role: "hair", hex: "#f0d060" },
          { role: "shirt", hex: "#1a2a5a" },
          { role: "accent", hex: "#b41e2f" }
        ],
        styleTokens: ["西装"],
        typicalScene: "演讲台",
        sourceConfidence: "high",
        citationNotes: [],
        referenceImages: []
      },
      referenceImages: []
    }
  },
  {
    name: "初音未来 chibi",
    input: {
      characterName: "初音未来",
      appearance: {
        schemaVersion: "0.1",
        gender: "female",
        animeStyle: "chibi",
        build: "slim",
        ageBand: "teen",
        faceShape: "圆脸",
        skinTone: { name: "白皙", hex: "#fde8d8" },
        hair: {
          style: "青绿色双马尾",
          color: { name: "葱绿", hex: "#39c5bb" }
        },
        eyes: {
          color: { name: "葱绿", hex: "#39c5bb" },
          shape: "大眼水汪汪",
          expression: "开心"
        },
        facialFeatures: ["腮红"],
        outfit: {
          iconic: true,
          top: {
            name: "灰色无袖衬衫",
            color: { name: "灰", hex: "#6b7280" },
            details: []
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
        styleTokens: ["偶像"],
        typicalScene: "舞台",
        sourceConfidence: "high",
        citationNotes: [],
        referenceImages: []
      },
      referenceImages: []
    }
  }
];

let passed = 0;
let failed = 0;

for (const c of cases) {
  try {
    const sprite = buildLayeredPetFromAppearance(c.input);
    const parsed = parseSprite(sprite);
    if (!parsed.ok) {
      console.error(`✗ ${c.name}`);
      console.error("  ", parsed.errors?.slice(0, 5));
      failed++;
      continue;
    }
    if (parsed.data.mode !== "layered-css") {
      console.error(`✗ ${c.name}: mode 应为 layered-css，实际 ${parsed.data.mode}`);
      failed++;
      continue;
    }
    const layerCount = parsed.data.layered?.layers.length ?? 0;
    const source = parsed.data.layered?.primarySource;
    const sig = parsed.data.layered?.signature;
    console.log(
      `✓ ${c.name} | mode=layered-css | source=${source} | layers=${layerCount} | signature=${sig}`
    );
    passed++;
  } catch (e) {
    console.error(`✗ ${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
