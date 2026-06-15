#!/usr/bin/env node
/**
 * Regression checks for "web search enabled means real web search happened".
 *
 * No external network is used. We mock fetch to emulate common proxy failures:
 * - non-search model silently falling back to normal chat
 * - search-preview response with no url_citation annotations
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const adapterPath = resolve(repoRoot, "apps/desktop/dist/main/main/adapters/llm-adapter.js");

const { LLMAdapter } = require(adapterPath);

function provider(model) {
  return {
    kind: "openai-compatible",
    baseUrl: "https://proxy.example/v1",
    apiKey: "test-key",
    model,
    defaultTemperature: 0.4,
    defaultMaxTokens: 512
  };
}

async function expectError(name, fn, includes) {
  const result = await fn();
  if (result.kind !== "error") {
    console.error(`FAIL ${name}: expected error, got`, result);
    process.exit(1);
  }
  if (includes && !String(result.message).includes(includes)) {
    console.error(`FAIL ${name}: message did not include ${includes}`, result.message);
    process.exit(1);
  }
  console.log(`OK ${name}: ${result.code} ${result.message.slice(0, 80)}`);
}

const originalFetch = globalThis.fetch;

try {
  await expectError(
    "non-search model cannot satisfy enableWebSearch",
    () =>
      new LLMAdapter(() => provider("gpt-4o-mini")).chatWithTools({
        systemPrompt: "search",
        messages: [{ role: "user", content: "search the web" }],
        stream: false,
        enableWebSearch: true,
        maxTokens: 64
      }),
    "联网"
  );

  // 新行为：search-preview 拿不到 annotations 时，不再 hard-fail。
  // 适配器尝试一次"短 query 重问"（前提：user message 中含「角色名」可以抠出来），
  // 如果重问仍空，soft-degrade：返回 done + citations=[]。
  // 由上层 research-pipeline 根据 sources.length=0 把 confidence 降到 low。
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "A plausible answer with no citations.",
              annotations: []
            },
            finish_reason: "stop"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  // user 必须带「角色名」「维度名」结构，buildShortReaskMessages 才会触发重试。
  // 这模拟了 research-pipeline 真实发出的 prompt。
  const noCite = await new LLMAdapter(() => provider("gpt-4o-mini-search-preview")).chatWithTools({
    systemPrompt: "search",
    messages: [
      {
        role: "user",
        content:
          "调研对象：「三笠」\n现在开始为「三笠」做「碎片表达与风格」调研。"
      }
    ],
    stream: false,
    enableWebSearch: true,
    maxTokens: 64,
    searchContextSize: "low"
  });
  if (noCite.kind !== "done") {
    console.error("FAIL search-preview empty annotations should soft-degrade, got error:", noCite);
    process.exit(1);
  }
  if (noCite.citations.length !== 0) {
    console.error("FAIL expected empty citations, got:", noCite.citations);
    process.exit(1);
  }
  if (fetchCalls !== 2) {
    console.error(`FAIL expected short-reask retry once (fetchCalls=2), got fetchCalls=${fetchCalls}`);
    process.exit(1);
  }
  console.log(
    `OK search-preview empty annotations triggers short-reask retry: fetchCalls=${fetchCalls}, citations=0`
  );

  // 当 user message 没有「」结构（如英文 prompt），跳过 short-reask 重试，直接 soft-degrade。
  // 避免无端付第二次费。
  fetchCalls = 0;
  const enNoCite = await new LLMAdapter(() => provider("gpt-4o-mini-search-preview")).chatWithTools({
    systemPrompt: "search",
    messages: [{ role: "user", content: "who won the 2024 Nobel prize in physics?" }],
    stream: false,
    enableWebSearch: true,
    maxTokens: 64,
    searchContextSize: "low"
  });
  if (enNoCite.kind !== "done") {
    console.error("FAIL english prompt empty annotations should soft-degrade:", enNoCite);
    process.exit(1);
  }
  if (fetchCalls !== 1) {
    console.error(
      `FAIL english prompt should skip short-reask (fetchCalls=1), got fetchCalls=${fetchCalls}`
    );
    process.exit(1);
  }
  console.log(
    `OK english prompt skips short-reask retry to avoid wasted spend: fetchCalls=${fetchCalls}`
  );

  // 新行为：正文里有裸 URL 但 annotations 为空时，应该把 URL 抓为 citations。
  // 这是为 OhMyGPT 等中转完全吞 annotations、但模型在 Markdown 里写了链接的兜底。
  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "John Hopfield and Geoffrey Hinton won. See https://www.nobelprize.org/prizes/physics/2024/press-release/ for details.",
              annotations: []
            },
            finish_reason: "stop"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const inlineCite = await new LLMAdapter(() => provider("gpt-4o-mini-search-preview")).chatWithTools({
    systemPrompt: "search",
    messages: [{ role: "user", content: "nobel?" }],
    stream: false,
    enableWebSearch: true,
    maxTokens: 64,
    searchContextSize: "low"
  });
  if (inlineCite.kind !== "done" || inlineCite.citations.length === 0) {
    console.error("FAIL inline URL in body should be captured as citation, got:", inlineCite);
    process.exit(1);
  }
  if (fetchCalls !== 1) {
    console.error(`FAIL inline URL pickup should NOT trigger retry, fetchCalls=${fetchCalls}`);
    process.exit(1);
  }
  console.log(
    `OK inline URL captured as citation without retry: citations=${inlineCite.citations.length}`
  );

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "Sourced answer.",
              annotations: [
                {
                  type: "url_citation",
                  url_citation: { url: "https://www.nobelprize.org/" }
                }
              ]
            },
            finish_reason: "stop"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const ok = await new LLMAdapter(() => provider("gpt-4o-mini-search-preview")).chatWithTools({
    systemPrompt: "search",
    messages: [{ role: "user", content: "who won the 2024 Nobel prize in physics?" }],
    stream: false,
    enableWebSearch: true,
    maxTokens: 64,
    searchContextSize: "low"
  });

  if (ok.kind !== "done" || ok.citations.length !== 1 || ok.toolEvents.length < 2) {
    console.error("FAIL cited search-preview response should pass:", ok);
    process.exit(1);
  }
  console.log(`OK cited search-preview response: citations=${ok.citations.length}`);
} finally {
  globalThis.fetch = originalFetch;
}
