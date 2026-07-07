/**
 * 极简版本号比较：项目里没有 electron-updater，也没有 semver 依赖，版本号
 * 都是简单的 `x.y.z` 形式（可能带前导 "v"），没必要为此引入一个完整的
 * semver 解析库——按 "." 分段转数字逐段比较就够用了。
 */

function parseVersion(raw: string): number[] {
  const cleaned = raw.trim().replace(/^v/i, "");
  if (!cleaned) return [];
  return cleaned.split(".").map((segment) => {
    const n = parseInt(segment, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** a 是否比 b 新（严格大于）。位数不一致时缺的一段按 0 处理（"1.2" 等价 "1.2.0"）。 */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

/**
 * 这个版本号是不是用户之前点过「忽略此版本」的那个。
 * 抽成共享函数是因为 update-scheduler.ts（自动检查）和 register.ts 的
 * AppCheckForUpdates handler（手动检查）都需要这个判断，两处各写一遍
 * 逻辑很容易以后改一边忘了改另一边。
 */
export function isVersionDismissed(
  latestVersion: string | undefined,
  dismissedTag: string | null
): boolean {
  return !!latestVersion && latestVersion === dismissedTag;
}
