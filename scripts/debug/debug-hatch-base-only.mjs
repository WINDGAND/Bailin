#!/usr/bin/env node
/**
 * 真实跑一次 base 立绘 + 1 个 row strip 通过 ImageGenerationAdapter，
 * 验证 fix 是否让 gpt-image-2 真正出图（之前 base 第一发就 400 死掉）。
 *
 * 用户 OhMyGPT API 统计里应当出现 gpt-image-2 的调用记录。
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const adapterPath = resolve(repoRoot, "apps/desktop/dist/main/main/adapters/image-generation-adapter.js");
const { ImageGenerationAdapter, DEFAULT_IMAGE_GENERATION_CONFIG, modelSupportsTransparent } = require(adapterPath);

function loadEnv(p) {
  const t = readFileSync(p, "utf-8");
  const e = {};
  for (const line of t.split(/\r?\n/)) {
    const x = line.trim();
    if (!x || x.startsWith("#")) continue;
    const eq = x.indexOf("=");
    if (eq < 0) continue;
    e[x.slice(0, eq).trim()] = x.slice(eq + 1).trim();
  }
  return e;
}
const env = loadEnv(resolve(repoRoot, ".env.dev"));

const llmProvider = {
  kind: "openai-compatible",
  baseUrl: env.BAILIN_LLM_BASE_URL,
  apiKey: env.BAILIN_LLM_API_KEY,
  model: env.BAILIN_LLM_MODEL ?? "bytedance/doubao-seed-2.0-lite-260428"
};
const config = DEFAULT_IMAGE_GENERATION_CONFIG;
const adapter = new ImageGenerationAdapter(
  () => config,
  () => llmProvider
);

const TIER = process.argv[2] ?? "standard"; // economy / standard / premium

console.log(`\n===== hatch base + 1 row 真实生图（tier=${TIER}）=====\n`);

const tierCfg = config.tiers[TIER];
const supportsTransparent = modelSupportsTransparent(tierCfg.model);
console.log(`model = ${tierCfg.model}`);
console.log(`supportsTransparent = ${supportsTransparent}`);
console.log(`将传 transparentBackground=true，adapter 应当${supportsTransparent ? "直接通过" : "智能改为 opaque"}\n`);

// Step 1: base 立绘 (generate)
console.log(">>> Step 1: base 立绘 (text-to-image)");
const cap = adapter.detectCapability();
console.log(`detectCapability = ${JSON.stringify(cap)}`);

const t1 = Date.now();
const base = await adapter.generate({
  prompt:
    "A friendly chibi mascot character, front-facing, full body, centered, " +
    "warm beige skin, short brown hair, dark teal collar. " +
    "Background must be a flat solid RGB(255,255,255) chroma key, no gradient. " +
    "Single character only, no text, no logos.",
  tier: TIER,
  transparentBackground: true,
  requestLabel: "debug:base"
});
const dt1 = Date.now() - t1;
console.log(`base.kind=${base.kind} dt=${dt1}ms`);
if (base.kind === "error") {
  console.error(`!!! base FAILED: ${base.code}: ${base.message.slice(0, 300)}`);
  process.exit(1);
}
console.log(
  `   model=${base.model} tier=${base.tier} bytes=${base.buffer.length} mime=${base.mimeType} cost=$${base.estimatedCostUsd}`
);

const outDir = resolve(repoRoot, "scripts/debug/_hatch-smoke");
mkdirSync(outDir, { recursive: true });
const basePath = resolve(outDir, `base-${TIER}.png`);
writeFileSync(basePath, base.buffer);
console.log(`   → ${basePath}`);

// Step 2: 1 row (edit, 用 base 作为参考)
console.log(`\n>>> Step 2: 1 row strip (edit, 用 base 作为参考图)`);
const t2 = Date.now();
const row = await adapter.edit({
  prompt:
    "A horizontal animation strip of 4 frames showing the same chibi mascot doing an idle breath/blink/bob cycle. " +
    "Identity must match the reference image. " +
    "Background must be a flat solid RGB(255,255,255) chroma key, no gradient.",
  images: [`data:image/png;base64,${base.buffer.toString("base64")}`],
  tier: TIER,
  transparentBackground: true,
  size: "1024x1024",
  requestLabel: "debug:row-idle"
});
const dt2 = Date.now() - t2;
console.log(`row.kind=${row.kind} dt=${dt2}ms`);
if (row.kind === "error") {
  console.error(`!!! row FAILED: ${row.code}: ${row.message.slice(0, 300)}`);
  process.exit(2);
}
console.log(
  `   model=${row.model} tier=${row.tier} bytes=${row.buffer.length} cost=$${row.estimatedCostUsd}`
);
const rowPath = resolve(outDir, `row-idle-${TIER}.png`);
writeFileSync(rowPath, row.buffer);
console.log(`   → ${rowPath}`);

console.log(`\n[PASS] hatch base+row 真实生图链路 OK，预计花费 $${((base.estimatedCostUsd ?? 0) + (row.estimatedCostUsd ?? 0)).toFixed(3)}`);
console.log(`检查 OhMyGPT 账单：应当出现 ${tierCfg.model} 的 2 次调用。`);
