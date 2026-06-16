#!/usr/bin/env node
/**
 * 端到端测试：直接调用真实的 NuwaOrchestrator.createCharacterDeep（编译后），
 * 喂真实的 LLMAdapter（用 .env.dev 的 OhMyGPT），全程自动 approve 两个 checkpoint，
 * 走完 6 Agent 并行调研 + 提炼 + 深度外貌 + Sprite + 自检。
 *
 * 跑法：node scripts/debug/debug-deep-e2e.mjs ["角色名"]
 *   默认角色：三笠
 *
 * 输出：每个进度事件打日志；结束时打 isSkeleton / warnings / 调研引用统计 / 自检 verdict。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
const BASE = process.env.NUWA_PET_LLM_BASE_URL ?? "https://api.ohmygpt.com/v1";
const MODEL = process.env.NUWA_PET_LLM_MODEL ?? "gpt-4o-mini";

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

const characterName = process.argv[2] ?? "三笠";
const config = {
  characterName,
  sourceType: "public-figure",
  track: "utility",
  enableWebSearch: true,
  concurrency: 2,
  agentTimeoutMs: 300000,
  researchModel: "gpt-4o-mini-search-preview"
};

const jobId = "e2e-" + Date.now();
console.log("[deep-e2e] jobId =", jobId, "·  base =", BASE, "·  model =", MODEL);
console.log("[deep-e2e] researchModel =", config.researchModel);
console.log("[deep-e2e] character =", characterName);
console.log("");

const startedAt = Date.now();
let researchSummary = null;
let synthesisSummary = null;
let appearanceReady = false;
let qualityReport = null;
let finalBundle = null;
let finalIsSkeleton = false;
let allWarnings = [];

const gen = orch.createCharacterDeep({
  jobId,
  config,
  // 自动 approve 两个 checkpoint
  awaitApproval: async (phase) => {
    console.log(`[deep-e2e] auto-approve checkpoint: ${phase}`);
  }
});

for await (const evt of gen) {
  const t = String(((Date.now() - startedAt) / 1000).toFixed(1)).padStart(6) + "s";
  switch (evt.kind) {
    case "started":
      console.log(`[${t}] started`);
      break;
    case "phase":
      console.log(`[${t}] phase=${evt.phase} progress=${evt.progress}% ${evt.message}`);
      break;
    case "agent_start":
      console.log(`[${t}]   agent#${evt.agentId} START · ${evt.agentName}`);
      break;
    case "agent_done":
      console.log(
        `[${t}]   agent#${evt.doc.agentId} DONE  · ${evt.doc.status} · ${Math.round(
          evt.doc.durationMs / 1000
        )}s · 引用 ${evt.doc.sources.length} · conf=${evt.doc.confidence}` +
          (evt.doc.webSearchUsed ? " · 联网✓" : " · 无联网")
      );
      break;
    case "research_complete":
      researchSummary = evt.summary;
      console.log(
        `[${t}] research_complete: ok=${evt.summary.okCount}/6 fail=${evt.summary.failedCount} ` +
          `用时=${Math.round(evt.summary.totalDurationMs / 1000)}s`
      );
      break;
    case "synthesis_summary":
      synthesisSummary = evt.summary;
      console.log(`[${t}] synthesis_summary:`);
      console.log("        心智模型:", evt.summary.mentalModelNames.join(" · "));
      console.log("        启发式数:", evt.summary.heuristicsCount);
      console.log("        签名词:", evt.summary.expressionSignatures.join(" · "));
      console.log("        内在张力:", (evt.summary.tensions ?? []).join(" · "));
      break;
    case "appearance_ready":
      appearanceReady = true;
      console.log(
        `[${t}] appearance_ready: build=${evt.appearance.build} age=${evt.appearance.ageBand} ` +
          `palette=${evt.appearance.palette.length} 项`
      );
      break;
    case "quality_report":
      qualityReport = evt.report;
      console.log(
        `[${t}] quality_report: verdict=${evt.report.verdict} score=${(evt.report.overallScore * 100).toFixed(
          0
        )}/100`
      );
      for (const it of evt.report.items) {
        console.log(`        [${it.pass ? "✓" : "✗"}] ${it.label} — ${it.reason}`);
      }
      if (evt.report.voiceTest) {
        console.log(`        voice ${evt.report.voiceTest.score}/10: ${evt.report.voiceTest.critique}`);
      }
      break;
    case "warning":
      allWarnings.push(evt.message);
      console.log(`[${t}] ⚠️  ${evt.message}`);
      break;
    case "done":
      finalBundle = evt.bundle;
      finalIsSkeleton = evt.isSkeleton;
      allWarnings.push(...(evt.warnings ?? []));
      console.log(
        `[${t}] DONE · isSkeleton=${evt.isSkeleton} · warnings=${(evt.warnings ?? []).length}`
      );
      break;
    case "failed":
      console.log(`[${t}] FAILED · ${evt.reason}`);
      break;
    case "cancelled":
      console.log(`[${t}] CANCELLED`);
      break;
  }
}

// 把 bundle + research_docs 落盘到 .smoke-out/<jobId>/，方便人工审查
const outDir = resolve(root, ".smoke-out", jobId);
mkdirSync(outDir, { recursive: true });
if (finalBundle) {
  writeFileSync(resolve(outDir, "bundle.json"), JSON.stringify(finalBundle, null, 2), "utf8");
  for (const d of finalBundle.researchDocs ?? []) {
    const slug = ["writings", "conversations", "expression-dna", "external-views", "decisions", "timeline"][
      d.agentId - 1
    ];
    writeFileSync(
      resolve(outDir, String(d.agentId).padStart(2, "0") + "-" + slug + ".md"),
      d.markdown,
      "utf8"
    );
  }
  if (qualityReport) {
    writeFileSync(resolve(outDir, "quality-report.json"), JSON.stringify(qualityReport, null, 2), "utf8");
  }
}

const totalSeconds = Math.round((Date.now() - startedAt) / 1000);
console.log("\n========== SUMMARY ==========");
console.log("总耗时:", totalSeconds, "秒");
console.log("isSkeleton:", finalIsSkeleton);
console.log("warnings:", allWarnings.length);
if (researchSummary) {
  console.log(
    "调研: ok=" + researchSummary.okCount + "/6, fail=" + researchSummary.failedCount +
      ", 总引用=" + (researchSummary.docs ?? []).reduce((a, d) => a + (d.sources?.length ?? 0), 0)
  );
}
console.log("外貌:", appearanceReady ? "ok" : "miss");
console.log(
  "Sprite:",
  finalBundle?.sprite?.dsl?.parts?.length ? `ok (${finalBundle.sprite.dsl.parts.length} 部件)` : "skeleton"
);
console.log("产物目录:", outDir);

if (finalIsSkeleton) process.exit(7);
if (researchSummary && researchSummary.okCount < 4) process.exit(8);
process.exit(0);
