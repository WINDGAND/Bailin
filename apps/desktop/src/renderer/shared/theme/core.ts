export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "bailin.theme";

export function normalizeThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

export function readStoredThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function persistThemePreference(preference: ThemePreference): void {
  localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyResolvedTheme(resolveTheme(preference));
}

export function bootstrapThemeFromStorage(): void {
  applyResolvedTheme(resolveTheme(readStoredThemePreference()));
}
