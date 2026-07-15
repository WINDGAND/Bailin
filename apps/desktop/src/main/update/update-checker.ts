import type { UpdateCheckResult } from "../../shared/ipc-contract.js";
import { isNewerVersion } from "../../shared/version-compare.js";

/**
 * Bailin 在 GitHub 上的仓库——仅用于拼 Release API 地址，硬编码是有意的：
 * 这不是一个可配置项，跟着仓库走就行，换仓库地址本来就要改代码。
 */
const GITHUB_REPO = "WINDGAND/Bailin";
const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const CHECK_TIMEOUT_MS = 10_000;

interface GitHubReleaseResponse {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
}

/**
 * 检查 GitHub 上最新 Release 是否比当前版本新。
 *
 * 只做"查询 + 比较"，不做任何静默下载/安装——项目的安装包未签名、也没有
 * electron-updater/更新服务器基础设施，静默自动更新会被 Windows SmartScreen
 * 拦下，现在只适合"提醒 + 引导用户去 Release 页手动下载"。
 *
 * 网络/解析失败一律返回 `{ hasUpdate: false, error }`，不抛异常——这是一个
 * 后台便利检查，失败了不该打断用户或搞崩后台定时任务。
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  let res: Response;
  try {
    res = await fetch(GITHUB_RELEASES_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        // GitHub API 要求带 User-Agent，否则可能直接拒绝请求。
        "User-Agent": "Bailin-Desktop-UpdateChecker"
      },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
  } catch (e) {
    return { hasUpdate: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!res.ok) {
    return { hasUpdate: false, error: `GitHub API 返回 HTTP ${res.status}` };
  }

  let json: GitHubReleaseResponse;
  try {
    json = (await res.json()) as GitHubReleaseResponse;
  } catch {
    return { hasUpdate: false, error: "GitHub 返回内容无法解析" };
  }

  const tag = json.tag_name;
  if (!tag) {
    return { hasUpdate: false, error: "GitHub 响应缺少 tag_name" };
  }

  const latestVersion = tag.replace(/^v/i, "");
  const hasUpdate = isNewerVersion(latestVersion, currentVersion);

  return {
    hasUpdate,
    latestVersion,
    releaseUrl: json.html_url ?? `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
    releaseNotes: json.body ?? "",
    publishedAt: json.published_at
  };
}
