const GITHUB_REPO = "WINDGAND/Bailin";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 45 * 60 * 1000;

export interface ReleaseSummary {
  version: string;
  tag: string;
  title: string;
  publishedAt: string;
  url: string;
  notesMarkdown: string;
}

export type ListReleasesResult =
  | { ok: true; releases: ReleaseSummary[] }
  | { ok: false; error: string };

interface GitHubReleaseItem {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

let cache: { expiresAt: number; result: ListReleasesResult } | null = null;

/** 测试用：清空模块级缓存 */
export function clearReleaseListCacheForTests(): void {
  cache = null;
}

export async function fetchReleaseSummaries(options?: {
  perPage?: number;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  bypassCache?: boolean;
}): Promise<ListReleasesResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const bypassCache = options?.bypassCache ?? false;

  if (!bypassCache && cache && nowMs < cache.expiresAt) {
    return cache.result;
  }

  const perPage = options?.perPage ?? 15;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${perPage}`;
  const fetchImpl = options?.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Bailin-Desktop-UpdateChecker"
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
  } catch (e) {
    const result: ListReleasesResult = {
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    };
    cache = { expiresAt: nowMs + CACHE_TTL_MS, result };
    return result;
  }

  if (!res.ok) {
    const result: ListReleasesResult = {
      ok: false,
      error: `GitHub API 返回 HTTP ${res.status}`
    };
    cache = { expiresAt: nowMs + CACHE_TTL_MS, result };
    return result;
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    const result: ListReleasesResult = {
      ok: false,
      error: "GitHub 返回内容无法解析"
    };
    cache = { expiresAt: nowMs + CACHE_TTL_MS, result };
    return result;
  }

  if (!Array.isArray(json)) {
    const result: ListReleasesResult = {
      ok: false,
      error: "GitHub 响应格式无效"
    };
    cache = { expiresAt: nowMs + CACHE_TTL_MS, result };
    return result;
  }

  const releases: ReleaseSummary[] = [];
  for (const item of json as GitHubReleaseItem[]) {
    if (item.draft || item.prerelease) continue;

    const tag = item.tag_name;
    if (!tag) continue;

    const title = item.name?.trim() || tag;

    releases.push({
      version: tag.replace(/^v/i, ""),
      tag,
      title,
      publishedAt: item.published_at ?? "",
      url: item.html_url ?? `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
      notesMarkdown: item.body ?? ""
    });
  }

  const result: ListReleasesResult = { ok: true, releases };
  cache = { expiresAt: nowMs + CACHE_TTL_MS, result };
  return result;
}
