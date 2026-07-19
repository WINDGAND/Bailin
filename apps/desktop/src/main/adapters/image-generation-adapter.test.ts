import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DEFAULT_IMAGE_GENERATION_CONFIG,
  ImageGenerationAdapter
} from "./image-generation-adapter.js";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
