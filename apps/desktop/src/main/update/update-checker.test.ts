import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkForUpdates } from "./update-checker.js";

describe("checkForUpdates", () => {
  it("uses the injected fetch implementation for Electron proxy support", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify({ tag_name: "v0.0.8" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const result = await checkForUpdates("0.0.8", fetchImpl as typeof fetch);

    assert.equal(calls, 1);
    assert.equal(result.hasUpdate, false);
    assert.equal(result.latestVersion, "0.0.8");
  });

  it("reports GitHub rate limiting instead of calling it a network failure", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          message: "API rate limit exceeded for 203.0.113.1."
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" }
        }
      );

    const result = await checkForUpdates("0.0.8", fetchImpl as typeof fetch);

    assert.equal(result.hasUpdate, false);
    assert.match(result.error ?? "", /请求过于频繁|限流/);
  });
});
