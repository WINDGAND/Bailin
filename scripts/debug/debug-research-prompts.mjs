#!/usr/bin/env node
/**
 * 用真实的 6 个 research-agent prompt 复现造人流程的联网搜索行为。
 * 不像简短问题，研究 agent prompt 巨长（system 800+ 字 + user 600+ 字），
 * 这里要验证：在真实 prompt 下，gpt-4o-mini-search-preview 是不是经常不触发搜索。
 *
 * 跑法：node scripts/debug/debug-research-prompts.mjs [characterName]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

const promptsPath = resolve(repoRoot, "packages/prompts/dist/index.cjs");
const { buildResearchAgentPrompt, RESEARCH_AGENT_ORDER } = require(promptsPath);

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

function chatCompletionsUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed + "/chat/completions" : trimmed + "/v1/chat/completions";
}

const env = loadEnv(resolve(repoRoot, ".env.dev"));
const baseUrl = env.BAILIN_LLM_BASE_URL;
const apiKey = env.BAILIN_LLM_API_KEY;
const url = chatCompletionsUrl(baseUrl);
const MODEL = "gpt-4o-mini-search-preview";
const characterName = process.argv[2] ?? "三笠";

// 模拟 orchestrator 已解析出的消歧义上下文（"三笠"歧义太多，必须带原作锚点）
const sourceContext = process.argv[3] ?? "进击的巨人";
const englishName = process.argv[4] ?? "Mikasa Ackerman";

const inputs = RESEARCH_AGENT_ORDER.map((slug) => ({
  slug,
  ...buildResearchAgentPrompt(slug, {
    characterName,
    sourceType: "fictional",
    track: "companion",
    webSearchEnabled: true,
    sourceContext,
    englishName
  })
}));
console.log(`sourceContext = ${sourceContext}`);
console.log(`englishName   = ${englishName}`);

console.log(`\n===== 真实 6 个 research agent prompt 并发跑 =====`);
console.log(`character = ${characterName}`);
console.log(`model     = ${MODEL}`);
console.log(`url       = ${url}\n`);

async function runAgent({ slug, system, user, agentName }, idx) {
  const t0 = Date.now();
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: 2500,
    stream: false,
    web_search_options: { search_context_size: "medium" }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + apiKey
    },
    body: JSON.stringify(body)
  });
  const dt = Date.now() - t0;
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  const choice = json?.choices?.[0];
  const content = choice?.message?.content ?? "";
  const annotations = choice?.message?.annotations ?? [];
  const inlineUrls = (content.match(/https?:\/\/[^\s)\]）。，；：、]+/g) ?? []).length;
  console.log(
    `[#${idx} ${slug.padEnd(20)}] HTTP ${res.status} dt=${(dt / 1000).toFixed(1)}s ` +
      `len=${content.length} annotations=${annotations.length} inlineUrls=${inlineUrls} ` +
      `system=${system.length}字 user=${user.length}字`
  );
  if (annotations.length === 0 && inlineUrls === 0 && content.length > 0) {
    const fpath = resolve(repoRoot, `scripts/debug/_research-drop-${slug}-${Date.now()}.json`);
    writeFileSync(
      fpath,
      JSON.stringify(
        {
          slug,
          agentName,
          systemPreview: system.slice(0, 600),
          userPreview: user.slice(0, 600),
          response: json
        },
        null,
        2
      )
    );
    console.log(`        ↳ 0 annotations + 0 inline URLs，已落盘 ${fpath}`);
  }
  return {
    slug,
    annotations: annotations.length,
    inlineUrls,
    contentLen: content.length,
    dt
  };
}

const results = await Promise.all(inputs.map((i, idx) => runAgent(i, idx)));

console.log(`\n===== 结果汇总 =====`);
const totalCitations = results.reduce((s, r) => s + r.annotations, 0);
const totalInline = results.reduce((s, r) => s + r.inlineUrls, 0);
const passed = results.filter((r) => r.annotations > 0 || r.inlineUrls > 0).length;
console.log(`6 路：${passed} 路拿到来源；annotations 总计 ${totalCitations}；正文裸 URL 总计 ${totalInline}`);
if (passed === 0) {
  console.log("\n[VERDICT] 真实造人 prompt 下，search-preview 一条都不触发搜索。");
  console.log("修复方向：要么换 model（gpt-4o-search-preview），要么改 prompt 强制要求 search。");
} else if (passed < 6) {
  console.log(`\n[VERDICT] ${6 - passed}/6 没触发搜索。需要重试 / 降级 / 改 prompt。`);
} else {
  console.log("\n[VERDICT] 全部触发搜索。问题不在这一层。");
}
