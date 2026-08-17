/**
 * 设置页主题偏好的纯函数层：读写 localStorage、把 `system` 解析成实际亮/暗，
 * 再落到 `documentElement`。
 *
 * 与 `ThemeProvider` 分离，便于首屏在 React 挂载前 `bootstrapThemeFromStorage`，
 * 避免闪白/闪黑。隐私模式读存储失败时按 `system` 处理。
 */

/** 用户可选偏好；`system` 跟随操作系统 `prefers-color-scheme`。 */
export type ThemePreference = "light" | "dark" | "system";
/** 真正作用到 DOM 的主题，不含 `system`。 */
export type ResolvedTheme = "light" | "dark";

/** 渲染进程 localStorage 键，与主进程设置同步时也读这一份做首屏兜底。 */
export const THEME_STORAGE_KEY = "bailin.theme";

/**
 * 把任意存储值钳成合法偏好。
 * @param raw localStorage / IPC 读到的字符串，缺省或非法时回退 `system`。
 */
export function normalizeThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

/**
 * 把偏好解析成可应用到 DOM 的亮/暗。
 * `system` 在无 `window`（测试/SSR）时一律当 light，避免 matchMedia 抛错。
 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * 把已解析主题写到根节点。
 * 副作用：改 `data-theme` 与 `color-scheme`，供 CSS 变量与原生控件着色。
 */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

/**
 * 从 localStorage 读主题偏好。
 * 隐私模式或禁用存储时 `getItem` 会抛，捕获后当 `system`。
 */
export function readStoredThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/**
 * 持久化偏好并立刻应用到 DOM。
 * 副作用：写 localStorage、改 `documentElement`；不调主进程 IPC（由 Provider 另行同步）。
 */
export function persistThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyResolvedTheme(resolveTheme(preference));
}

/**
 * 首屏启动：按本地存储（或 system 兜底）立刻上色，无需等 React / IPC。
 */
export function bootstrapThemeFromStorage(): void {
  applyResolvedTheme(resolveTheme(readStoredThemePreference()));
}
