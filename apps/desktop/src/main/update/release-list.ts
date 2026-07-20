const GITHUB_REPO = "WINDGAND/Bailin";
const FETCH_TIMEOUT_MS = 10_000;
/** 本地缓存在此时间内视为新鲜：直接返回，不打 GitHub。 */
const DISK_FRESH_MS = 6 * 60 * 60 * 1000;

export interface ReleaseSummary {
  version: string;
  tag: string;
  title: string;
  publishedAt: string;
  url: string;
  notesMarkdown: string;
}

export type ListReleasesResult =
  | {
      ok: true;
      releases: ReleaseSummary[];
      fromCache?: boolean;
      /** 网络失败回退缓存时的可读原因（例如 GitHub API 限流）。 */
      staleReason?: string;
    }
  | { ok: false; error: string };

export interface PersistedReleaseCache {
  latestTag: string;
  fetchedAt: number;
  releases: ReleaseSummary[];
}

/** 可注入的持久化（生产走 LocalVault；测试用内存）。 */
export interface ReleaseListStore {
  load(): PersistedReleaseCache | null;
  save(data: PersistedReleaseCache): void;
}

interface GitHubReleaseItem {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string | null;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Bailin-Desktop-UpdateChecker"
} as const;

let memoryStore: ReleaseListStore | null = null;

/** 测试用：清空模块级默认内存 store。 */
export function clearReleaseListCacheForTests(): void {
  memoryStore = null;
}

function getDefaultMemoryStore(): ReleaseListStore {
  if (!memoryStore) {
    let data: PersistedReleaseCache | null = null;
    memoryStore = {
      load: () => data,
      save: (next) => {
        data = next;
      }
    };
  }
  return memoryStore;
}

function mapReleaseItems(json: unknown): ReleaseSummary[] | null {
  if (!Array.isArray(json)) return null;
  const releases: ReleaseSummary[] = [];
  for (const item of json as GitHubReleaseItem[]) {
    if (item.draft || item.prerelease) continue;
    const tag = item.tag_name;
    if (!tag) continue;
    releases.push({
      version: tag.replace(/^v/i, ""),
      tag,
      title: item.name?.trim() || tag,
      publishedAt: item.published_at ?? "",
      url: item.html_url ?? `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
      notesMarkdown: item.body ?? ""
    });
  }
  return releases;
}

async function githubGet(
  url: string,
  fetchImpl: typeof fetch
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { ...GITHUB_HEADERS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      if (typeof body?.message === "string" && body.message.trim()) {
        detail = body.message.trim();
      }
    } catch {
      // ignore body parse failures
    }
    if (res.status === 403 && /rate limit/i.test(detail)) {
      return {
        ok: false,
        error: "GitHub API 请求过于频繁（未认证限流），请稍后再试"
      };
    }
    return {
      ok: false,
      error: detail
        ? `GitHub API 返回 HTTP ${res.status}：${detail}`
        : `GitHub API 返回 HTTP ${res.status}`
    };
  }
  try {
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, error: "GitHub 返回内容无法解析" };
  }
}

function cacheFallback(
  disk: PersistedReleaseCache,
  staleReason: string
): ListReleasesResult {
  return {
    ok: true,
    releases: disk.releases,
    fromCache: true,
    staleReason
  };
}

/**
 * 拉取 / 刷新 Release 列表。
 *
 * 策略：
 * 1. 磁盘（或注入 store）有缓存且未过新鲜期 → 直接返回，0 次网络
 * 2. 否则先 GET /releases/latest；tag 与本地一致 → 只更新 fetchedAt，不拉列表
 * 3. tag 更新或无本地缓存 → GET /releases?per_page=N 写回 store
 * 4. 网络失败但有本地缓存 → 仍返回缓存（fromCache: true）
 */
export async function fetchReleaseSummaries(options?: {
  perPage?: number;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  /** true：忽略新鲜期，强制走 latest（必要时再拉列表）。 */
  forceRefresh?: boolean;
  store?: ReleaseListStore;
}): Promise<ListReleasesResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const forceRefresh = options?.forceRefresh ?? false;
  const perPage = options?.perPage ?? 15;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const store = options?.store ?? getDefaultMemoryStore();

  const disk = store.load();

  if (!forceRefresh && disk && nowMs - disk.fetchedAt < DISK_FRESH_MS) {
    return { ok: true, releases: disk.releases, fromCache: true };
  }

  const latestUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const latestRes = await githubGet(latestUrl, fetchImpl);

  if (!latestRes.ok) {
    if (disk) {
      return cacheFallback(disk, latestRes.error);
    }
    return { ok: false, error: latestRes.error };
  }

  const latestJson = latestRes.json as { tag_name?: string };
  const latestTag = latestJson.tag_name;
  if (!latestTag) {
    if (disk) {
      return cacheFallback(disk, "GitHub 响应缺少 tag_name");
    }
    return { ok: false, error: "GitHub 响应缺少 tag_name" };
  }

  const diskContainsLatest = disk?.releases.some((release) => release.tag === latestTag) ?? false;
  if (disk && disk.latestTag === latestTag && diskContainsLatest) {
    store.save({ ...disk, fetchedAt: nowMs });
    return { ok: true, releases: disk.releases, fromCache: true };
  }

  const listUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${perPage}`;
  const listRes = await githubGet(listUrl, fetchImpl);
  if (!listRes.ok) {
    if (disk) {
      return cacheFallback(disk, listRes.error);
    }
    return { ok: false, error: listRes.error };
  }

  const releases = mapReleaseItems(listRes.json);
  if (!releases) {
    if (disk) {
      return cacheFallback(disk, "GitHub 响应格式无效");
    }
    return { ok: false, error: "GitHub 响应格式无效" };
  }

  store.save({ latestTag, fetchedAt: nowMs, releases });
  return { ok: true, releases, fromCache: false };
}

export { DISK_FRESH_MS };
