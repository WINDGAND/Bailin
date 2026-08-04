import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_IMAGE_GENERATION_CONFIG,
  ImageGenerationAdapter,
  dashScopeMultimodalGenerationUrl,
  normalizeDashScopeImageModel,
  toDashScopeSize
} from "./image-generation-adapter.js";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("normalizeDashScopeImageModel", () => {
  it("maps qwen-vl-max-latest to image models", () => {
    assert.equal(normalizeDashScopeImageModel("qwen-vl-max-latest", "generate"), "qwen-image-max");
    assert.equal(normalizeDashScopeImageModel("qwen-vl-max-latest", "edit"), "qwen-image-2.0");
  });
});

describe("dashScopeMultimodalGenerationUrl", () => {
  it("rewrites compatible-mode base to native multimodal endpoint", () => {
    assert.equal(
      dashScopeMultimodalGenerationUrl("https://dashscope.aliyuncs.com/compatible-mode/v1"),
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
    );
  });
});

describe("toDashScopeSize", () => {
  it("converts openai size for max/plus presets", () => {
    assert.equal(toDashScopeSize("1024x1024", "qwen-image-max"), "1328*1328");
    assert.equal(toDashScopeSize("1024x1024", "qwen-image-2.0"), "1024*1024");
  });
});

describe("ImageGenerationAdapter.edit multipart images", () => {
  it("sends multiple edit references under the provider-compatible image field", async () => {
    let formKeys: string[] = [];
    globalThis.fetch = (async (_url, init) => {
      assert.ok(init?.body instanceof FormData);
      formKeys = [...init.body.keys()];
      return new Response(
        JSON.stringify({
          data: [{ b64_json: ONE_PIXEL_PNG.split(",")[1] }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const adapter = new ImageGenerationAdapter(
      () => DEFAULT_IMAGE_GENERATION_CONFIG,
      () => ({ baseUrl: "https://images.example/v1", apiKey: "test-key", model: "unused" })
    );

    const result = await adapter.edit({
      prompt: "draw a sprite row",
      images: [ONE_PIXEL_PNG, ONE_PIXEL_PNG],
      tier: "standard"
    });

    assert.equal(result.kind, "done");
    assert.deepEqual(
      formKeys.filter((key) => key.startsWith("image")),
      ["image", "image"],
      `expected repeated image fields, got ${JSON.stringify(formKeys)}`
    );
  });
});

describe("ImageGenerationAdapter DashScope generate", () => {
  it("uses native multimodal API and maps qwen-vl model", async () => {
    let apiUrl = "";
    let seenBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (url, init) => {
      const u = String(url);
      if (u.includes("multimodal-generation")) {
        apiUrl = u;
        seenBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            output: {
              choices: [
                {
                  message: {
                    content: [{ image: "https://example.com/out.png" }]
                  }
                }
              ]
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      // download result image
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64"
      );
      return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch;

    const adapter = new ImageGenerationAdapter(
      () => ({
        ...DEFAULT_IMAGE_GENERATION_CONFIG,
        tiers: {
          ...DEFAULT_IMAGE_GENERATION_CONFIG.tiers,
          standard: {
            ...DEFAULT_IMAGE_GENERATION_CONFIG.tiers.standard,
            model: "qwen-vl-max-latest"
          }
        }
      }),
      () => ({
        kind: "openai-compatible" as const,
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "sk-test",
        model: "qwen3.7-plus"
      })
    );

    const result = await adapter.generate({
      prompt: "a chibi pet",
      tier: "standard"
    });
    assert.equal(result.kind, "done");
    assert.match(apiUrl, /multimodal-generation\/generation/);
    assert.equal(seenBody?.model, "qwen-image-max");
    assert.equal(apiUrl.includes("images/generations"), false);
  });
});
