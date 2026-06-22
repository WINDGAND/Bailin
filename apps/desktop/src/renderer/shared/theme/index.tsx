import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useBailin } from "../use-bailin.js";
import { useToast } from "../feedback.js";
import { useT } from "../i18n/index.js";
import {
  applyResolvedTheme,
  bootstrapThemeFromStorage,
  persistThemePreference,
  readStoredThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference
} from "./core.js";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (next: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const bailin = useBailin();
  const { showToast } = useToast();
  const t = useT();
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredThemePreference());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredThemePreference()));

  const applyPreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    persistThemePreference(next);
    setResolved(resolveTheme(next));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        applyPreference(await bailin.app.getTheme());
      } catch {
        bootstrapThemeFromStorage();
        setPreference(readStoredThemePreference());
        setResolved(resolveTheme(readStoredThemePreference()));
      }
    })();
  }, [bailin, applyPreference]);

  useEffect(() => {
    const off = bailin.on.themeChanged((next) => {
      applyPreference(next);
    });
    return off;
  }, [bailin, applyPreference]);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const nextResolved = resolveTheme("system");
      setResolved(nextResolved);
      applyResolvedTheme(nextResolved);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [preference]);

  const setTheme = useCallback(
    async (next: ThemePreference) => {
      if (next === preference) return;
      await bailin.app.setTheme(next);
      applyPreference(next);
      showToast({ kind: "success", text: t("settings.themeSaved") });
    },
    [bailin, preference, applyPreference, showToast, t]
  );

  const value = useMemo(
    () => ({ preference, resolved, setTheme }),
    [preference, resolved, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
