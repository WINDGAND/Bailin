import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  LLMAdapter,
  matchesVisionModel,
  normalizeQwenModelId,
  resolveVisionModel,
  resolveWebSearchModel,
  usesQwenEnableSearch
} from "./llm-adapter.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("normalizeQwenModelId", () => {
  it("strips trailing -search from qwen ids only", () => {
    assert.equal(normalizeQwenModelId("qwen-plus-search"), "qwen-plus");
    assert.equal(normalizeQwenModelId("qwen-max-search"), "qwen-max");
    assert.equal(normalizeQwenModelId("qwen3.7-plus"), "qwen3.7-plus");
    assert.equal(
      normalizeQwenModelId("gpt-4o-mini-search-preview"),
      "gpt-4o-mini-search-preview"
    );
  });
});

describe("matchesVisionModel qwen", () => {
  it("accepts qwen3.x and vl series", () => {
    assert.equal(matchesVisionModel("qwen3.7-plus"), true);
    assert.equal(matchesVisionModel("qwen-vl-plus"), true);
    assert.equal(matchesVisionModel("qwen2.5-vl-max"), true);
    assert.equal(matchesVisionModel("qwen-plus"), false);
    assert.equal(matchesVisionModel("qwen-max"), false);
  });
});

describe("resolveVisionModel qwen fallback", () => {
  it("falls back from qwen-plus-search to multimodal main model", () => {
    const resolved = resolveVisionModel({
      kind: "openai-compatible",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "sk-test",
      model: "qwen3.7-plus",
      visionModel: "qwen-plus-search"
    });
    assert.equal(resolved, "qwen3.7-plus");
  });

  it("keeps real vl model after normalize", () => {
    const resolved = resolveVisionModel({
      kind: "openai-compatible",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "sk-test",
      model: "qwen-plus",
      visionModel: "qwen-vl-plus"
    });
    assert.equal(resolved, "qwen-vl-plus");
  });
});

describe("resolveWebSearchModel qwen", () => {
  it("normalizes qwen-*-search", () => {
    assert.equal(
      resolveWebSearchModel({
        kind: "openai-compatible",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "sk-test",
        model: "qwen3.7-plus",
        webSearchModel: "qwen-max-search"
      }),
      "qwen-max"
    );
  });
});

describe("usesQwenEnableSearch", () => {
  it("detects dashscope baseUrl and qwen model names", () => {
    assert.equal(
      usesQwenEnableSearch("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-max"),
      true
    );
    assert.equal(usesQwenEnableSearch("https://api.openai.com/v1", "qwen-plus"), true);
    assert.equal(usesQwenEnableSearch("https://api.openai.com/v1", "gpt-4o-mini"), false);
  });
});

describe("LLMAdapter qwen enable_search path", () => {
  it("routes qwen-max-search via enable_search and soft-passes probe", async () => {
    let seenBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url, init) => {
      seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "John Hopfield and Geoffrey Hinton won in 2024."
              },
              finish_reason: "stop"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const adapter = new LLMAdapter(() => ({
      kind: "openai-compatible",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "sk-test",
      model: "qwen3.7-plus",
      visionModel: "qwen-plus-search",
      webSearchModel: "qwen-max-search"
    }));

    assert.equal(adapter.detectCapabilities().webSearch, true);
    assert.equal(adapter.detectVisionCapability().vision, true);
    assert.equal(adapter.getVisionModel(), "qwen3.7-plus");
    assert.equal(adapter.getWebSearchModel(), "qwen-max");

    const probe = await adapter.probeWebSearch();
    assert.equal(probe.ok, true);
    assert.equal(probe.realWebSearch, true);
    assert.equal(seenBody?.model, "qwen-max");
    assert.equal(seenBody?.enable_search, true);
    assert.ok(seenBody?.search_options);
    assert.equal((seenBody?.search_options as { forced_search?: boolean }).forced_search, true);
    assert.equal(seenBody?.web_search_options, undefined);
  });

  it("keeps search-preview path for non-qwen models", async () => {
    let seenBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_url, init) => {
      seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "ok https://example.com/nobel",
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: { url: "https://example.com/nobel" }
                  }
                ]
              },
              finish_reason: "stop"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const adapter = new LLMAdapter(() => ({
      kind: "openai-compatible",
      baseUrl: "https://api.ohmygpt.com/v1",
      apiKey: "sk-test",
      model: "deepseek-v4-flash",
      webSearchModel: "gpt-4o-mini-search-preview"
    }));

    const r = await adapter.chatWithTools({
      systemPrompt: "search",
      messages: [{ role: "user", content: "who won" }],
      stream: false,
      enableWebSearch: true,
      modelOverride: "gpt-4o-mini-search-preview"
    });
    assert.equal(r.kind, "done");
    assert.equal(seenBody?.model, "gpt-4o-mini-search-preview");
    assert.ok(seenBody?.web_search_options);
    assert.equal(seenBody?.enable_search, undefined);
  });
});
