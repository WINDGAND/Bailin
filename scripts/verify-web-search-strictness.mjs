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
const repoRoot = resolve(__dirname, "..");
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

  globalThis.fetch = async () =>
    new Response(
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

  await expectError(
    "search-preview without citations is rejected",
    () =>
      new LLMAdapter(() => provider("gpt-4o-mini-search-preview")).chatWithTools({
        systemPrompt: "search",
        messages: [{ role: "user", content: "who won the 2024 Nobel prize in physics?" }],
        stream: false,
        enableWebSearch: true,
        maxTokens: 64,
        searchContextSize: "low"
      }),
    "citation"
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
