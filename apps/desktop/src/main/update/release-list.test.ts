import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  clearReleaseListCacheForTests,
  fetchReleaseSummaries,
  type PersistedReleaseCache,
  type ReleaseListStore
} from "./release-list.js";

function memoryStore(initial: PersistedReleaseCache | null = null): ReleaseListStore & {
  data: PersistedReleaseCache | null;
} {
  const s = {
    data: initial,
    load(): PersistedReleaseCache | null {
      return s.data;
    },
    save(next: PersistedReleaseCache): void {
      s.data = next;
    }
  };
  return s;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchReleaseSummaries", () => {
  beforeEach(() => clearReleaseListCacheForTests());

  it("maps published non-draft non-prerelease releases on cold start", async () => {
    const store = memoryStore();
    const urls: string[] = [];
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/releases/latest")) {
        return jsonResponse({ tag_name: "v0.0.6" });
      }
      return jsonResponse([
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
      ]);
    };

    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      nowMs: 1_000_000,
      forceRefresh: true
    });
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
    assert.equal(store.data?.latestTag, "v0.0.6");
    assert.equal(urls.filter((u) => u.includes("/releases/latest")).length, 1);
    assert.equal(urls.filter((u) => u.includes("per_page=")).length, 1);
  });

  it("returns fresh disk cache with zero network calls", async () => {
    let calls = 0;
    const store = memoryStore({
      latestTag: "v0.0.6",
      fetchedAt: 1_000_000,
      releases: [
        {
          version: "0.0.6",
          tag: "v0.0.6",
          title: "cached",
          publishedAt: "2026-07-13T04:00:00Z",
          url: "https://example.com/v6",
          notesMarkdown: ""
        }
      ]
    });
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse({});
    };
    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      nowMs: 1_000_000 + 60_000
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.title, "cached");
    assert.equal(result.fromCache, true);
    assert.equal(calls, 0);
  });

  it("only hits /latest when cache is stale but tag unchanged", async () => {
    const urls: string[] = [];
    const store = memoryStore({
      latestTag: "v0.0.6",
      fetchedAt: 1_000_000,
      releases: [
        {
          version: "0.0.6",
          tag: "v0.0.6",
          title: "old fetch",
          publishedAt: "2026-07-13T04:00:00Z",
          url: "https://example.com/v6",
          notesMarkdown: ""
        }
      ]
    });
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/releases/latest")) {
        return jsonResponse({ tag_name: "v0.0.6" });
      }
      return jsonResponse([], 500);
    };
    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      nowMs: 1_000_000 + 7 * 60 * 60 * 1000,
      forceRefresh: false
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.title, "old fetch");
    assert.equal(urls.length, 1);
    assert.match(urls[0] ?? "", /\/releases\/latest/);
    assert.equal(store.data?.fetchedAt, 1_000_000 + 7 * 60 * 60 * 1000);
  });

  it("force refresh repairs a cache whose latest tag is missing from its release list", async () => {
    const urls: string[] = [];
    const store = memoryStore({
      latestTag: "v0.0.8",
      fetchedAt: 1_000_000,
      releases: [
        {
          version: "0.0.7",
          tag: "v0.0.7",
          title: "stale list",
          publishedAt: "2026-07-15T04:00:00Z",
          url: "https://example.com/v7",
          notesMarkdown: ""
        }
      ]
    });
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/releases/latest")) {
        return jsonResponse({ tag_name: "v0.0.8" });
      }
      return jsonResponse([
        {
          tag_name: "v0.0.8",
          name: "Bailin v0.0.8",
          html_url: "https://example.com/v8",
          body: "",
          published_at: "2026-07-19T04:00:00Z",
          draft: false,
          prerelease: false
        }
      ]);
    };

    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      nowMs: 2_000_000,
      forceRefresh: true
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.tag, "v0.0.8");
    assert.equal(result.fromCache, false);
    assert.equal(urls.length, 2);
  });

  it("refetches list when latest tag is newer than disk", async () => {
    const store = memoryStore({
      latestTag: "v0.0.5",
      fetchedAt: 1_000_000,
      releases: [
        {
          version: "0.0.5",
          tag: "v0.0.5",
          title: "v5",
          publishedAt: "",
          url: "https://example.com/v5",
          notesMarkdown: ""
        }
      ]
    });
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return jsonResponse({ tag_name: "v0.0.6" });
      }
      return jsonResponse([
        {
          tag_name: "v0.0.6",
          name: "Bailin v0.0.6",
          html_url: "https://example.com/v6",
          body: "",
          published_at: "2026-07-13T04:00:00Z",
          draft: false,
          prerelease: false
        }
      ]);
    };
    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      nowMs: 1_000_000 + 7 * 60 * 60 * 1000
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.tag, "v0.0.6");
    assert.equal(store.data?.latestTag, "v0.0.6");
    assert.equal(result.fromCache, false);
  });

  it("falls back to disk when network fails", async () => {
    const store = memoryStore({
      latestTag: "v0.0.6",
      fetchedAt: 1_000_000,
      releases: [
        {
          version: "0.0.6",
          tag: "v0.0.6",
          title: "stale ok",
          publishedAt: "",
          url: "https://example.com/v6",
          notesMarkdown: ""
        }
      ]
    });
    const fetchImpl = async () => new Response("nope", { status: 403 });
    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      nowMs: 1_000_000 + 7 * 60 * 60 * 1000,
      forceRefresh: true
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.title, "stale ok");
    assert.equal(result.fromCache, true);
    assert.match(result.staleReason ?? "", /限流|HTTP 403|rate limit/i);
  });

  it("returns ok:false on HTTP error with empty store", async () => {
    const store = memoryStore();
    const fetchImpl = async () => new Response("nope", { status: 403 });
    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      forceRefresh: true
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /403/);
  });

  it("falls back title to tag when name empty", async () => {
    const store = memoryStore();
    const fetchImpl = async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/releases/latest")) {
        return jsonResponse({ tag_name: "v0.0.3" });
      }
      return jsonResponse([
        {
          tag_name: "v0.0.3",
          name: "  ",
          html_url: "https://example.com/v3",
          body: "",
          published_at: "2026-05-01T00:00:00Z",
          draft: false,
          prerelease: false
        }
      ]);
    };
    const result = await fetchReleaseSummaries({
      fetchImpl: fetchImpl as typeof fetch,
      store,
      forceRefresh: true
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.releases[0]?.title, "v0.0.3");
  });
});
