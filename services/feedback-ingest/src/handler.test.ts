import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleFeedback, type IngestEnv } from "./handler.js";

function pngFile(name = "a.png"): File {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  return new File([bytes], name, { type: "image/png" });
}

function memoryKv(initial?: Record<string, string>, throwOnPut = false): IngestEnv["FEEDBACK_KV"] {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      if (throwOnPut) throw new Error("kv down");
      store.set(key, value);
    }
  };
}

function env(kv: IngestEnv["FEEDBACK_KV"]): IngestEnv {
  return {
    FEEDBACK_KV: kv,
    FEISHU_APP_ID: "app",
    FEISHU_APP_SECRET: "secret",
    FEISHU_CHAT_ID: "chat_1"
  };
}

function requestFromForm(fields: Record<string, string>, files: File[] = []): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const file of files) fd.append("files", file);
  return new Request("https://example.test/v1/feedback", { method: "POST", body: fd });
}

function mockFeishu(options?: { messagesStatus?: number; messagesCode?: number }): typeof fetch {
  const messagesStatus = options?.messagesStatus ?? 200;
  const messagesCode = options?.messagesCode ?? 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("tenant_access_token")) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: "tok" }), { status: 200 });
    }
    if (url.includes("/im/v1/images")) {
      return new Response(JSON.stringify({ code: 0, data: { image_key: "img_1" } }), { status: 200 });
    }
    if (url.includes("/im/v1/messages")) {
      return new Response(JSON.stringify({ code: messagesCode, msg: "feishu-raw-should-not-leak" }), {
        status: messagesStatus
      });
    }
    return new Response("unexpected " + url + " " + init?.method, { status: 500 });
  }) as typeof fetch;
}

const now = new Date("2026-08-13T01:15:00.000Z");
const hourKey = "2026-08-13-01";

describe("handleFeedback", () => {
  it("returns 200 and a feishu post with version and 未留", async () => {
    let posted = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/im/v1/messages")) {
        posted = String(init?.body ?? "");
        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      }
      return mockFeishu()(input, init);
    }) as typeof fetch;

    const res = await handleFeedback(requestFromForm({ body: "12345678", version: "0.0.14" }), env(memoryKv()), {
      fetchImpl,
      now,
      ip: "1.1.1.1"
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const payload = JSON.parse(posted) as { msg_type: string; content: string };
    assert.equal(payload.msg_type, "post");
    const post = JSON.parse(payload.content) as { zh_cn: { title: string; content: Array<Array<{ text?: string }>> } };
    assert.match(post.zh_cn.title, /v0\.0\.14/);
    const texts = post.zh_cn.content.flat().map((n) => n.text ?? "").join("\n");
    assert.match(texts, /未留/);
    assert.match(texts, /12345678/);
  });

  it("uploads png and includes image_key", async () => {
    let posted = "";
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/im/v1/messages")) {
        posted = String(init?.body ?? "");
        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      }
      return mockFeishu()(input, init);
    }) as typeof fetch;

    const res = await handleFeedback(
      requestFromForm({ body: "12345678", version: "0.0.14" }, [pngFile()]),
      env(memoryKv()),
      { fetchImpl, now, ip: "1.1.1.1" }
    );
    assert.equal(res.status, 200);
    const payload = JSON.parse(posted) as { content: string };
    assert.match(payload.content, /img_1/);
  });

  it("returns 400 for missing body, bad mime, or 4 files", async () => {
    const fetchImpl = mockFeishu();
    const missing = await handleFeedback(requestFromForm({ version: "0.0.14" }), env(memoryKv()), {
      fetchImpl,
      now,
      ip: "2.2.2.2"
    });
    assert.equal(missing.status, 400);

    const bad = await handleFeedback(
      requestFromForm({ body: "12345678", version: "0.0.14" }, [
        new File([new Uint8Array([1, 2, 3, 4])], "a.png", { type: "image/png" })
      ]),
      env(memoryKv()),
      { fetchImpl, now, ip: "2.2.2.3" }
    );
    assert.equal(bad.status, 400);

    const four = await handleFeedback(
      requestFromForm({ body: "12345678", version: "0.0.14" }, [
        pngFile("1.png"),
        pngFile("2.png"),
        pngFile("3.png"),
        pngFile("4.png")
      ]),
      env(memoryKv()),
      { fetchImpl, now, ip: "2.2.2.4" }
    );
    assert.equal(four.status, 400);
  });

  it("returns 400 for a non-email contact", async () => {
    const res = await handleFeedback(
      requestFromForm({ body: "12345678", version: "0.0.14", contact: "my_wechat" }),
      env(memoryKv()),
      { fetchImpl: mockFeishu(), now, ip: "2.2.2.5" }
    );
    assert.equal(res.status, 400);
  });

  it("returns 429 on the 6th request in the same UTC hour", async () => {
    const kv = memoryKv({ [`rl:1.1.1.1:${hourKey}`]: "5" });
    const res = await handleFeedback(requestFromForm({ body: "12345678", version: "0.0.14" }), env(kv), {
      fetchImpl: mockFeishu(),
      now,
      ip: "1.1.1.1"
    });
    assert.equal(res.status, 429);
    const json = (await res.json()) as { ok: boolean; code: string };
    assert.equal(json.ok, false);
    assert.equal(json.code, "rate_limited");
  });

  it("maps feishu 500 to 502 without leaking raw body", async () => {
    const res = await handleFeedback(requestFromForm({ body: "12345678", version: "0.0.14" }), env(memoryKv()), {
      fetchImpl: mockFeishu({ messagesStatus: 500 }),
      now,
      ip: "3.3.3.3"
    });
    assert.equal(res.status, 502);
    const json = (await res.json()) as { ok: boolean; code: string; message: string };
    assert.equal(json.code, "upstream");
    assert.doesNotMatch(json.message, /feishu-raw-should-not-leak/);
  });

  it("maps KV put failure to 502", async () => {
    const res = await handleFeedback(
      requestFromForm({ body: "12345678", version: "0.0.14" }),
      env(memoryKv(undefined, true)),
      { fetchImpl: mockFeishu(), now, ip: "4.4.4.4" }
    );
    assert.equal(res.status, 502);
  });
});
