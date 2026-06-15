#!/usr/bin/env node
/**
 * 走完整 adapter 调用链：模拟真实造人流程的 6 路并发调研。
 * 用新的 buildResearchAgentPrompt（带 sourceContext + englishName）+ LLMAdapter（带 retry + 日志）。
 *
 * 跑法：node scripts/debug/debug-full-research-flow.mjs 三笠 进击的巨人 "Mikasa Ackerman"
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const adapterPath = resolve(repoRoot, "apps/desktop/dist/main/main/adapters/llm-adapter.js");
const pipelinePath = resolve(repoRoot, "apps/desktop/dist/main/main/orchestration/research-pipeline.js");
const { LLMAdapter } = require(adapterPath);
const { runResearchAgents } = require(pipelinePath);

function loadEnv(path) {
  const txt = readFileSync(path, "utf-8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv(resolve(repoRoot, ".env.dev"));
const baseUrl = env.NUWA_PET_LLM_BASE_URL;
const apiKey = env.NUWA_PET_LLM_API_KEY;

const characterName = process.argv[2] ?? "三笠";
const sourceContext = process.argv[3] ?? "进击的巨人";
const englishName = process.argv[4] ?? "Mikasa Ackerman";

const adapter = new LLMAdapter(() => ({
  kind: "openai-compatible",
  baseUrl,
  apiKey,
  model: "deepseek-v4-flash"
}));

console.log(`\n===== 完整链路：runResearchAgents + LLMAdapter (with retry + 埋点) =====`);
console.log(`character = ${characterName}`);
console.log(`sourceContext = ${sourceContext}`);
console.log(`englishName   = ${englishName}\n`);

const t0 = Date.now();
const result = await runResearchAgents(adapter, {
  characterName,
  sourceType: "fictional",
  track: "companion",
  sourceContext,
  englishName,
  webSearchEnabled: true,
  concurrency: 6,
  timeoutMs: 5 * 60_000,
  researchModel: "gpt-4o-mini-search-preview"
});
const dt = Date.now() - t0;

console.log(`\n===== 结果 =====`);
console.log(`ok=${result.okCount}/6 failed=${result.failedCount} totalDt=${dt}ms`);
for (const d of result.docs) {
  console.log(
    `  #${d.agentId} ${d.agentName.padEnd(12)} status=${d.status.padEnd(7)} ` +
      `webSearchUsed=${d.webSearchUsed} sources=${d.sources.length} confidence=${d.confidence}`
  );
}
const realWebUsed = result.docs.filter((d) => d.webSearchUsed).length;
const totalSources = result.docs.reduce((s, d) => s + d.sources.length, 0);
console.log(`\nrealWebUsed = ${realWebUsed}/6`);
console.log(`totalSources = ${totalSources}`);
if (realWebUsed === 6) {
  console.log(`\n[PASS] 完整链路 6/6 都拿到了来源。问题彻底修好。`);
  process.exit(0);
}
console.log(`\n[FAIL] 仍然有 ${6 - realWebUsed} 路没拿到来源，需要再看日志。`);
process.exit(1);
