#!/usr/bin/env node
// 一次性 smoke：验证 LLM Adapter 把 multimodal ChatMessage 转成 OpenAI / Anthropic 期望的请求体。
// 不发真实请求；mock fetch 并断言 body.messages 的 content 字段结构。
//
// 跑法（先 build:main）：
//   pnpm --filter=./apps/desktop run build:main
//   node scripts/verify-llm-multimodal.mjs

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const adapterPath = resolve(
  repoRoot,
  "apps/desktop/dist/main/main/adapters/llm-adapter.js"
);

const { LLMAdapter } = require(adapterPath);

const SAMPLE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let failed = 0;
function assertEqual(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`[OK] ${label}`);
  } else {
    failed += 1;
    console.error(`[FAIL] ${label}`);
    console.error(`  expected: ${e}`);
    console.error(`  actual:   ${a}`);
  }
}

async function runCase(label, provider, message) {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    // 返回最小成功响应
    if (provider.kind === "openai-compatible") {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    const adapter = new LLMAdapter(() => provider);
    await adapter.chatOnce({
      systemPrompt: "sys",
      messages: [message],
      stream: false,
      maxTokens: 50
    });
    return capturedBody;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// ============================================================
// Case 1: OpenAI · 纯文本字符串 → 直接透传字符串
// ============================================================
{
  const body = await runCase(
    "openai · string content stays string",
    {
      kind: "openai-compatible",
      baseUrl: "https://api.openai.com",
      apiKey: "test",
      model: "gpt-4o-mini"
    },
    { role: "user", content: "hello" }
  );
  assertEqual(
    "openai · text-only message",
    body.messages[1],
    { role: "user", content: "hello" }
  );
}

// ============================================================
// Case 2: OpenAI · 多模态 text + image → image_url 块
// ============================================================
{
  const body = await runCase(
    "openai · multimodal text + image",
    {
      kind: "openai-compatible",
      baseUrl: "https://api.openai.com",
      apiKey: "test",
      model: "gpt-4o-mini"
    },
    {
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image", url: SAMPLE_IMAGE, detail: "high" }
      ]
    }
  );
  assertEqual(
    "openai · multimodal message",
    body.messages[1],
    {
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image_url", image_url: { url: SAMPLE_IMAGE, detail: "high" } }
      ]
    }
  );
}

// ============================================================
// Case 3: Anthropic · 纯字符串 → 包成 [{type:'text'}]
// ============================================================
{
  const body = await runCase(
    "anthropic · string content wrapped as text block",
    {
      kind: "anthropic-compatible",
      baseUrl: "https://api.anthropic.com",
      apiKey: "test",
      model: "claude-haiku-4-5"
    },
    { role: "user", content: "hello" }
  );
  assertEqual(
    "anthropic · text-only message",
    body.messages[0],
    { role: "user", content: [{ type: "text", text: "hello" }] }
  );
}

// ============================================================
// Case 4: Anthropic · 多模态 data URI → image source base64
// ============================================================
{
  const body = await runCase(
    "anthropic · multimodal data URI",
    {
      kind: "anthropic-compatible",
      baseUrl: "https://api.anthropic.com",
      apiKey: "test",
      model: "claude-haiku-4-5"
    },
    {
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image", url: SAMPLE_IMAGE, detail: "high" }
      ]
    }
  );
  assertEqual(
    "anthropic · base64 image block",
    body.messages[0],
    {
      role: "user",
      content: [
        { type: "text", text: "describe" },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: SAMPLE_IMAGE.split(",")[1]
          }
        }
      ]
    }
  );
}

// ============================================================
// Case 5: Anthropic · https URL → image source url
// ============================================================
{
  const body = await runCase(
    "anthropic · multimodal https URL",
    {
      kind: "anthropic-compatible",
      baseUrl: "https://api.anthropic.com",
      apiKey: "test",
      model: "claude-haiku-4-5"
    },
    {
      role: "user",
      content: [
        { type: "image", url: "https://example.com/cat.jpg" }
      ]
    }
  );
  assertEqual(
    "anthropic · url image block",
    body.messages[0],
    {
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: "https://example.com/cat.jpg" } }
      ]
    }
  );
}

// ============================================================
// Case 6: detectVisionCapability 白名单
// ============================================================
{
  const adapter = new (require(adapterPath).LLMAdapter)(() => ({
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com",
    apiKey: "test",
    model: "gpt-4o-mini"
  }));
  const v = adapter.detectVisionCapability();
  if (v.vision === true) {
    console.log(`[OK] detectVisionCapability · gpt-4o-mini 命中 vision 白名单`);
  } else {
    failed += 1;
    console.error(`[FAIL] detectVisionCapability · gpt-4o-mini 应该被识别为 vision`);
  }
}

{
  const adapter = new (require(adapterPath).LLMAdapter)(() => ({
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com",
    apiKey: "test",
    model: "gpt-3.5-turbo"
  }));
  const v = adapter.detectVisionCapability();
  if (v.vision === false) {
    console.log(`[OK] detectVisionCapability · gpt-3.5-turbo 正确识别为不支持 vision`);
  } else {
    failed += 1;
    console.error(`[FAIL] detectVisionCapability · gpt-3.5-turbo 不该被识别为 vision`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${6 + 2} multimodal cases passed.`);
