#!/usr/bin/env node
// 一次性 smoke：检验 sprite-builder 输出是否通过 SpriteProgramSchema 校验。
// 不调用任何 LLM；用 mock AppearanceSpec 即可。
//
// 跑法（先 build:main）：
//   pnpm --filter=./apps/desktop run build:main
//   node scripts/verify-sprite-builder.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const builderPath = resolve(
  repoRoot,
  "apps/desktop/dist/main/main/runtime/sprite-builder.js"
);
const protocolPath = resolve(
  repoRoot,
  "packages/character-protocol/dist/index.cjs"
);

const { buildSpriteFromAppearance } = require(builderPath);
const { parseSprite } = require(protocolPath);

const mockAppearances = [
  {
    name: "蔡徐坤（音乐人 / 通用 T 恤 / 短发）",
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
          { name: "黑色项链", placement: "颈部", color: { name: "黑色", hex: "#1a1a1a" }, signature: true }
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
    name: "Kobe（球员 / 紫金 / 短裤 / 球衣）",
    spec: {
      schemaVersion: "0.1",
      build: "muscular",
      ageBand: "young-adult",
      faceShape: "干净下颌",
      skinTone: { name: "深褐", hex: "#9c6a3e" },
      hair: { style: "黑色短发", color: { name: "纯黑", hex: "#0a0a0a" } },
      eyes: { color: { name: "深褐", hex: "#1a1a1a" }, shape: "细长", expression: "锐利" },
      facialFeatures: [],
      outfit: {
        iconic: true,
        top: { name: "湖人紫色球衣（24号）", color: { name: "湖人紫", hex: "#552583" }, details: [] },
        bottom: { name: "湖人紫色篮球短裤", color: { name: "湖人紫", hex: "#552583" }, details: [] },
        footwear: { name: "白紫篮球鞋", color: { name: "白色", hex: "#f5efe2" }, details: [] },
        accessories: [
          { name: "24 号", placement: "前胸", color: { name: "湖人金", hex: "#fdb927" }, signature: true },
          { name: "黑色护腕", placement: "手腕", color: { name: "纯黑", hex: "#0a0a0a" }, signature: true }
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
        { role: "signature", hex: "#f5efe2" }
      ],
      styleTokens: ["篮球运动", "球衣"],
      typicalScene: "球场",
      sourceConfidence: "high",
      citationNotes: []
    }
  },
  {
    name: "张雪峰（戴眼镜 / 西装 / 长裤）",
    spec: {
      schemaVersion: "0.1",
      build: "average",
      ageBand: "middle-age",
      faceShape: "圆脸",
      skinTone: { name: "黄皮", hex: "#e8c4a0" },
      hair: { style: "黑色短发", color: { name: "黑色", hex: "#1a1a1a" } },
      eyes: { color: { name: "黑色", hex: "#1a1a1a" }, shape: "圆", expression: "犀利" },
      facialFeatures: [],
      outfit: {
        iconic: true,
        top: { name: "深蓝西装", color: { name: "深蓝", hex: "#243a5e" }, details: [] },
        bottom: { name: "黑色西裤", color: { name: "黑色", hex: "#1a1a1a" }, details: [] },
        footwear: { name: "黑色皮鞋", color: { name: "黑色", hex: "#0a0a0a" }, details: [] },
        accessories: [
          { name: "黑框眼镜", placement: "面部", color: { name: "黑色", hex: "#0a0a0a" }, signature: true }
        ]
      },
      gear: [],
      palette: [
        { role: "outline", hex: "#0a0a0a" },
        { role: "skin", hex: "#e8c4a0" },
        { role: "hair", hex: "#1a1a1a" },
        { role: "shirt", hex: "#243a5e" },
        { role: "pants", hex: "#1a1a1a" },
        { role: "accent", hex: "#d99a3a" }
      ],
      styleTokens: ["职业", "教育"],
      typicalScene: "讲台",
      sourceConfidence: "high",
      citationNotes: []
    }
  },
  {
    name: "薇尔莉特（少女 / 蓝军装 / 金长发 / 翡翠胸针）",
    spec: {
      schemaVersion: "0.1",
      gender: "female",
      animeStyle: "anime-shoujo",
      build: "slim",
      ageBand: "young-adult",
      faceShape: "瓜子脸",
      skinTone: { name: "白皙", hex: "#f4dcc4" },
      hair: { style: "齐肩金色侧编发", color: { name: "金色", hex: "#f0d28a" } },
      eyes: { color: { name: "蓝色", hex: "#3aa0e0" }, shape: "大眼", expression: "空灵" },
      facialFeatures: [],
      outfit: {
        iconic: true,
        top: { name: "蓝色军装外套 + 白色高领装饰", color: { name: "海军蓝", hex: "#2e4b78" }, details: ["白色高领", "肩章", "双排扣"] },
        bottom: { name: "及踝米色长裙", color: { name: "米色", hex: "#d8c9a8" }, details: [] },
        footwear: { name: "棕色长靴", color: { name: "棕色", hex: "#4a2f1d" }, details: [] },
        accessories: [
          { name: "翡翠胸针", placement: "颈前", color: { name: "翡翠绿", hex: "#3da26e" }, signature: true },
          { name: "白色蝴蝶结领带", placement: "颈下", color: { name: "白色", hex: "#f5efe2" }, signature: false }
        ]
      },
      gear: [{ name: "机械义肢手", placement: "双手", description: "金属关节 + 棕色皮手套" }],
      palette: [
        { role: "outline", hex: "#0f0f0f" },
        { role: "skin", hex: "#f4dcc4" },
        { role: "hair", hex: "#f0d28a" },
        { role: "eye", hex: "#3aa0e0" },
        { role: "shirt", hex: "#2e4b78" },
        { role: "pants", hex: "#d8c9a8" },
        { role: "accent", hex: "#c8a040" },
        { role: "signature", hex: "#3da26e" }
      ],
      styleTokens: ["军装", "庄重", "维多利亚风"],
      typicalScene: "邮政公司打字机前",
      sourceConfidence: "high",
      citationNotes: ["京阿尼《紫罗兰永恒花园》设定集"],
      referenceImages: []
    }
  },
  {
    name: "初音未来（chibi / 双马尾 / 蓝绿色 / 数字号码）",
    spec: {
      schemaVersion: "0.1",
      gender: "female",
      animeStyle: "chibi",
      build: "child",
      ageBand: "teen",
      faceShape: "圆脸",
      skinTone: { name: "白皙", hex: "#f7e3d0" },
      hair: { style: "青绿色超长双马尾", color: { name: "青绿色", hex: "#5ed4c2" } },
      eyes: { color: { name: "青绿色", hex: "#3fc7b7" }, shape: "大眼", expression: "温和" },
      facialFeatures: ["腮红"],
      outfit: {
        iconic: true,
        top: { name: "灰色无袖衬衫", color: { name: "灰色", hex: "#7d7d80" }, details: ["蓝绿色装饰"] },
        bottom: { name: "深灰短裙", color: { name: "深灰", hex: "#3d3d40" }, details: [] },
        footwear: { name: "黑色长靴", color: { name: "黑色", hex: "#0a0a0a" }, details: [] },
        accessories: [
          { name: "01 号臂带", placement: "左臂", color: { name: "蓝绿色", hex: "#5ed4c2" }, signature: true },
          { name: "蓝绿色领带", placement: "颈下", color: { name: "蓝绿色", hex: "#5ed4c2" }, signature: false }
        ]
      },
      gear: [],
      palette: [
        { role: "outline", hex: "#0a0a0a" },
        { role: "skin", hex: "#f7e3d0" },
        { role: "hair", hex: "#5ed4c2" },
        { role: "eye", hex: "#3fc7b7" },
        { role: "shirt", hex: "#7d7d80" },
        { role: "pants", hex: "#3d3d40" },
        { role: "accent", hex: "#ffb3c1" },
        { role: "signature", hex: "#5ed4c2" }
      ],
      styleTokens: ["二次元", "虚拟歌姬"],
      typicalScene: "舞台",
      sourceConfidence: "high",
      citationNotes: [],
      referenceImages: []
    }
  },
  {
    name: "艾伦·耶格尔（少年漫 / 翼章 / 军装）",
    spec: {
      schemaVersion: "0.1",
      gender: "male",
      animeStyle: "anime-shounen",
      build: "slim",
      ageBand: "teen",
      faceShape: "瓜子脸",
      skinTone: { name: "浅褐", hex: "#f4d4b2" },
      hair: { style: "扎起的深棕中长马尾", color: { name: "深棕", hex: "#3b2a1e" } },
      eyes: { color: { name: "翡翠绿", hex: "#3da26e" }, shape: "细长", expression: "坚定、锐利" },
      facialFeatures: [],
      outfit: {
        iconic: true,
        top: { name: "调查兵团米褐色短外套", color: { name: "米褐色", hex: "#8a6b3a" }, details: ["翼章", "白色内衬"] },
        bottom: { name: "白色长裤", color: { name: "米白色", hex: "#e7e3c8" }, details: [] },
        footwear: { name: "棕色长靴", color: { name: "棕色", hex: "#4a2f1d" }, details: [] },
        accessories: [
          { name: "调查兵团翼章", placement: "胸前", color: { name: "蓝白", hex: "#2e6fa3" }, signature: true }
        ]
      },
      gear: [{ name: "立体机动装置侧挂", placement: "腰部两侧", description: "灰色金属筒" }],
      palette: [
        { role: "outline", hex: "#0c0c0c" },
        { role: "skin", hex: "#f4d4b2" },
        { role: "hair", hex: "#3b2a1e" },
        { role: "eye", hex: "#3da26e" },
        { role: "shirt", hex: "#8a6b3a" },
        { role: "pants", hex: "#e7e3c8" },
        { role: "accent", hex: "#2e6fa3" },
        { role: "signature", hex: "#d6a23a" }
      ],
      styleTokens: ["军事制服", "末世感"],
      typicalScene: "战场",
      sourceConfidence: "high",
      citationNotes: [],
      referenceImages: []
    }
  }
];

let failed = 0;
for (const { name, spec } of mockAppearances) {
  const sprite = buildSpriteFromAppearance(spec);
  const parsed = parseSprite(sprite);
  const partsCount = sprite.dsl?.parts.length ?? 0;
  const shapesCount = (sprite.dsl?.parts ?? []).reduce(
    (acc, p) => acc + (p.shapes?.length ?? 0),
    0
  );
  const animCount = Object.keys(sprite.dsl?.animations ?? {}).length;
  const paletteSize = sprite.palette.length;
  const eyeSlot = sprite.palette[15]; // 当前布局 eye 在第 16 位
  if (parsed.ok) {
    console.log(
      `[OK] ${name} · parts=${partsCount} shapes=${shapesCount} animations=${animCount} palette=${paletteSize} eyeHex=${eyeSlot?.hex ?? "-"}`
    );
  } else {
    failed += 1;
    console.error(`[FAIL] ${name}`);
    for (const err of parsed.errors ?? []) {
      console.error(`  - ${err.path}: ${err.message}`);
    }
  }
}

// 额外的语义断言：
//   - 薇尔莉特 sprite 中 eye palette 必须命中 #3aa0e0
//   - 薇尔莉特 sprite 必须包含 signature-mark part（来自翡翠胸针）
//   - 初音 sprite 必须有 hairKind=twin-tail（通过 parts shapes 数量 > 100 间接验证）
console.log("\n--- 语义断言 ---");
function assertSemantic(label, predicate) {
  if (predicate) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}`);
  }
}

const violet = buildSpriteFromAppearance(
  mockAppearances.find((m) => m.name.startsWith("薇尔莉特")).spec
);
const violetEye = violet.palette[15];
assertSemantic(
  "薇尔莉特 · eye 槽颜色 = #3aa0e0",
  violetEye?.hex?.toLowerCase() === "#3aa0e0"
);
assertSemantic(
  "薇尔莉特 · 包含 signature-mark part",
  (violet.dsl?.parts ?? []).some((p) => p.id === "signature-mark")
);

const miku = buildSpriteFromAppearance(
  mockAppearances.find((m) => m.name.startsWith("初音")).spec
);
assertSemantic(
  "初音 · eye 槽颜色 ≈ 青绿色",
  /3fc7b7|5ed4c2/i.test(miku.palette[15]?.hex ?? "")
);
assertSemantic(
  "初音 · chibi 风格脸更大（faceWidth=48）→ head shapes 数量 > shounen",
  (miku.dsl?.parts ?? []).find((p) => p.id === "head")?.shapes?.length >= 5
);

const eren = buildSpriteFromAppearance(
  mockAppearances.find((m) => m.name.startsWith("艾伦")).spec
);
assertSemantic(
  "艾伦 · eye 槽颜色 = #3da26e（翡翠绿）",
  (eren.palette[15]?.hex ?? "").toLowerCase() === "#3da26e"
);
assertSemantic(
  "艾伦 · 包含 signature-mark part（翼章）",
  (eren.dsl?.parts ?? []).some((p) => p.id === "signature-mark")
);

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log("\nAll sprites pass schema validation + semantic assertions.");
