#!/usr/bin/env node
/**
 * 回归检查："验证 Key 与主模型"（LLMAdapter.testConnection）在失败时必须把真实错误
 * 透传给上层，而不是被吞掉变成一句无意义的 "connection failed"。
 *
 * 背景 bug：用户反馈点击验证后只看到英文字面量 "connection failed"，无法判断是
 * Key 无效 / 网络失败 / 限流 / 服务商报错中的哪一种，导致无法自助排查也无法上报有效信息。
 * 根因：testConnection() 在 chatOnce 返回 { kind: "error" } 时，没有把 code/message
 * 透传出去，只返回 { ok:false, latencyMs }（没有 error 字段），上层 UI 于是套用兜底
 * 文案 "connection failed"（apps/desktop/src/renderer/settings/provider/apply-recommended-bundle.ts）。
 *
 * 不发真实网络请求；mock fetch 模拟 401 / 网络异常两种典型失败。
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const adapterPath = resolve(repoRoot, "apps/desktop/dist/main/main/adapters/llm-adapter.js");

const { LLMAdapter } = require(adapterPath);

function provider() {
  return {
    kind: "openai-compatible",
    baseUrl: "https://api.ohmygpt.com/v1",
    apiKey: "sk-test-invalid",
    model: "deepseek-v4-flash",
    defaultTemperature: 0.7,
    defaultMaxTokens: 800
  };
}

let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}${detail ? " — " + detail : ""}`);
  }
}

const originalFetch = globalThis.fetch;

try {
  // Case 1: HTTP 401（Key 无效/未授权）——必须把状态码/原始信息透传，不能是裸的 ok:false。
  globalThis.fetch = async () =>
    new Response("Incorrect API key provided", {
      status: 401,
      headers: { "content-type": "text/plain" }
    });

  const authResult = await new LLMAdapter(provider).testConnection();
  check("401 时 ok 必须是 false", authResult.ok === false);
  check(
    "401 时必须带上真实错误信息（不是被吞掉的 undefined）",
    typeof authResult.error === "string" && authResult.error.length > 0,
    `got error=${JSON.stringify(authResult.error)}`
  );
  check(
    "401 的错误信息不能是无意义的兜底文案 'connection failed'",
    authResult.error !== "connection failed",
    `got error=${JSON.stringify(authResult.error)}`
  );
  check(
    "401 的错误信息应包含原始响应内容，方便用户/开发者判断是鉴权问题",
    typeof authResult.error === "string" && authResult.error.includes("Incorrect API key"),
    `got error=${JSON.stringify(authResult.error)}`
  );

  // Case 2: 网络层异常（DNS/TLS/连接被拒绝等）——同样必须透传真实原因。
  globalThis.fetch = async () => {
    throw new Error("fetch failed: unable to verify the first certificate");
  };
  const netResult = await new LLMAdapter(provider).testConnection();
  check("网络异常时 ok 必须是 false", netResult.ok === false);
  check(
    "网络异常时必须带上真实错误信息",
    typeof netResult.error === "string" && netResult.error.length > 0,
    `got error=${JSON.stringify(netResult.error)}`
  );
  check(
    "网络异常的错误信息应包含底层异常内容，方便定位证书/代理问题",
    typeof netResult.error === "string" && netResult.error.includes("verify the first certificate"),
    `got error=${JSON.stringify(netResult.error)}`
  );

  // Case 3: HTTP 429（限流/余额不足）——文案要能区分开，不能和 401 混在一起。
  globalThis.fetch = async () =>
    new Response("Too many requests, please slow down", {
      status: 429,
      headers: { "content-type": "text/plain" }
    });
  const rateLimitResult = await new LLMAdapter(provider).testConnection();
  check("429 时 ok 必须是 false", rateLimitResult.ok === false);
  check("429 时 code 必须是 RATE_LIMITED", rateLimitResult.code === "RATE_LIMITED", `got code=${rateLimitResult.code}`);
  check(
    "429 的错误信息应包含原始响应内容",
    typeof rateLimitResult.error === "string" && rateLimitResult.error.includes("Too many requests"),
    `got error=${JSON.stringify(rateLimitResult.error)}`
  );

  // Case 4: HTTP 500（服务商挂了）——同样要透传，不能被吞成 401 的文案。
  globalThis.fetch = async () =>
    new Response("internal server error", {
      status: 500,
      headers: { "content-type": "text/plain" }
    });
  const providerErrResult = await new LLMAdapter(provider).testConnection();
  check("500 时 ok 必须是 false", providerErrResult.ok === false);
  check(
    "500 时 code 必须是 PROVIDER_ERROR",
    providerErrResult.code === "PROVIDER_ERROR",
    `got code=${providerErrResult.code}`
  );
  check(
    "500 的错误信息应包含原始响应内容",
    typeof providerErrResult.error === "string" && providerErrResult.error.includes("internal server error"),
    `got error=${JSON.stringify(providerErrResult.error)}`
  );

  // Case 5: 正常路径回归——修复错误透传逻辑不能破坏成功路径。
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  const okResult = await new LLMAdapter(provider).testConnection();
  check("成功路径 ok 必须是 true", okResult.ok === true, `got ${JSON.stringify(okResult)}`);
  check("成功路径不应带 error 字段", okResult.error === undefined, `got ${JSON.stringify(okResult)}`);
} finally {
  globalThis.fetch = originalFetch;
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll testConnection error-propagation cases passed.`);
