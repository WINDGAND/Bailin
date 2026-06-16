#!/usr/bin/env node
/**
 * 端到端测试：直接调用真实的 NuwaOrchestrator（编译后），
 * 喂真实的 LLMAdapter（用 .env.dev 的 DeepSeek），看 createCharacter 整体是否能跑通。
 *
 * 这等价于"用户在 UI 里点造人"的全链路，只不过不通过 Electron / IPC。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const toUrl = (p) => pathToFileURL(p).href;

const envPath = resolve(root, ".env.dev");
const envRaw = readFileSync(envPath, "utf8");
for (const line of envRaw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const KEY = process.env.NUWA_PET_LLM_API_KEY;
const BASE = process.env.NUWA_PET_LLM_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.NUWA_PET_LLM_MODEL ?? "deepseek-chat";

// 直接 import orchestrator（从 apps/desktop 的编译产物）
const { NuwaOrchestrator } = await import(
  toUrl(resolve(root, "apps/desktop/dist/main/main/orchestration/nuwa-orchestrator.js"))
);
const { LLMAdapter } = await import(
  toUrl(resolve(root, "apps/desktop/dist/main/main/adapters/llm-adapter.js"))
);

const provider = {
  kind: "openai-compatible",
  baseUrl: BASE,
  apiKey: KEY,
  model: MODEL
};
const llm = new LLMAdapter(() => provider);
const orch = new NuwaOrchestrator(llm);

const characters = [
  { characterName: "蔡徐坤", sourceType: "public-figure", track: "companion" },
  { characterName: "三笠", sourceType: "fictional", track: "companion" },
  { characterName: "鲁路修", sourceType: "fictional", track: "companion" }
];

for (const input of characters) {
  console.log(`\n======== 蒸馏: ${input.characterName} (${input.sourceType}, ${input.track}) ========`);
  const t0 = Date.now();
  const r = await orch.createCharacter(input);
  const elapsed = Date.now() - t0;
  console.log(`  耗时: ${elapsed}ms`);
  console.log(`  isSkeleton: ${r.isSkeleton}`);
  console.log(`  bundle.card.meta.name: ${r.bundle.card.meta.name}`);
  console.log(`  bundle.card.mentalModels.length: ${r.bundle.card.mentalModels.length}`);
  console.log(`  bundle.card.meta.appearance?: ${r.bundle.card.meta.appearance != null ? "yes" : "no"}`);
  console.log(`  bundle.sprite.parts.length: ${r.bundle.sprite.dsl?.parts?.length ?? 0}`);
  console.log(`  warnings (${r.warnings.length}):`);
  for (const w of r.warnings) console.log(`    - ${w}`);
}

console.log("\n[e2e] done");
