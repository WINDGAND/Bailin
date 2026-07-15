import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearReleaseListCacheForTests,
  fetchReleaseSummaries
} from "./release-list.js";

describe("fetchReleaseSummaries", () => {
  beforeEach(() => clearReleaseListCacheForTests());

  it("maps published non-draft non-prerelease releases", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: "v0.0.6",
            name: "Bailin v0.0.6",
            html_url: "https://github.com/WINDGAND/Bailin/releases/tag/v0.0.6",
            body: "## notes",
            published_at: "2026-07-13T04:00:00Z",
            draft: false,
            prerelease: false
          },
          {
            tag_name: "v0.0.5-beta",
            name: "beta",
            html_url: "https://example.com/beta",
            body: "",
            published_at: "2026-07-01T00:00:00Z",
            draft: false,
            prerelease: true
          },
          {
            tag_name: "v0.0.4",
            name: "",
            html_url: "https://example.com/v4",
            body: null,
            published_at: "2026-06-01T00:00:00Z",
            draft: true,
            prerelease: false
          }
        ]),
        { status: 200 }
      );

    const result = await fetchReleaseSummaries({ fetchImpl, bypassCache: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases.length, 1);
    assert.deepEqual(result.releases[0], {
      version: "0.0.6",
      tag: "v0.0.6",
      title: "Bailin v0.0.6",
      publishedAt: "2026-07-13T04:00:00Z",
      url: "https://github.com/WINDGAND/Bailin/releases/tag/v0.0.6",
      notesMarkdown: "## notes"
    });
  });

  it("falls back title to tag when name empty", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: "v0.0.3",
            name: "  ",
            html_url: "https://example.com/v3",
            body: "",
            published_at: "2026-05-01T00:00:00Z",
            draft: false,
            prerelease: false
          }
        ]),
        { status: 200 }
      );
    const result = await fetchReleaseSummaries({ fetchImpl, bypassCache: true });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.title, "v0.0.3");
  });

  it("returns ok:false on HTTP error", async () => {
    const fetchImpl = async () => new Response("nope", { status: 403 });
    const result = await fetchReleaseSummaries({ fetchImpl, bypassCache: true });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /403/);
  });

  it("reuses cache within TTL", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const t0 = 1_000_000;
    await fetchReleaseSummaries({ fetchImpl, nowMs: t0 });
    await fetchReleaseSummaries({ fetchImpl, nowMs: t0 + 60_000 });
    assert.equal(calls, 1);
  });
});
