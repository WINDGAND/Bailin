import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { submitFeedbackToIngest } from "./submit-feedback.js";

describe("submitFeedbackToIngest", () => {
  it("posts multipart with version and maps 200 ok", async () => {
    let url = "";
    let ua = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      ua = String(new Headers(init?.headers).get("user-agent") ?? "");
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      const form = init.body;
      assert.equal(form.get("body"), "12345678");
      assert.equal(form.get("version"), "0.0.14");
      assert.equal(form.get("contact"), null);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const r = await submitFeedbackToIngest({
      url: "https://example.test/v1/feedback",
      version: "0.0.14",
      value: { body: "12345678", files: [] },
      fetchImpl
    });
    assert.equal(r.ok, true);
    assert.equal(url, "https://example.test/v1/feedback");
    assert.match(ua, /Bailin-Desktop-Feedback\/0\.0\.14/);
  });

  it("includes contact and files when present", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      assert.ok(init?.body instanceof FormData);
      const form = init.body;
      assert.equal(form.get("contact"), "me@example.com");
      assert.equal(form.getAll("files").length, 1);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const r = await submitFeedbackToIngest({
      url: "https://example.test/v1/feedback",
      version: "0.0.14",
      value: {
        body: "12345678",
        contact: "me@example.com",
        files: [{ name: "a.png", mime: "image/png", bytes: png }]
      },
      fetchImpl
    });
    assert.equal(r.ok, true);
  });

  it("maps 429 to rate_limited", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, code: "rate_limited", message: "slow down" }), {
        status: 429
      })) as typeof fetch;
    const r = await submitFeedbackToIngest({
      version: "0.0.14",
      value: { body: "12345678", files: [] },
      fetchImpl
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "rate_limited");
      assert.equal(r.error, "slow down");
    }
  });

  it("maps 413 to too_large, 400 to invalid, 502 to upstream", async () => {
    for (const [status, code] of [
      [413, "too_large"],
      [400, "invalid"],
      [502, "upstream"]
    ] as const) {
      const fetchImpl = (async () =>
        new Response(JSON.stringify({ ok: false, code, message: code }), { status })) as typeof fetch;
      const r = await submitFeedbackToIngest({
        version: "1",
        value: { body: "12345678", files: [] },
        fetchImpl
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, code);
    }
  });

  it("maps network failure to offline", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const r = await submitFeedbackToIngest({
      version: "1",
      value: { body: "12345678", files: [] },
      fetchImpl
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "offline");
  });
});
