import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useNuwa } from "../use-nuwa.js";
import { en } from "./locales/en.js";
import { zh, type TranslationTree } from "./locales/zh.js";
import type { Locale, TranslationParams } from "./types.js";

const LOCALES: Record<Locale, TranslationTree> = { zh, en };

const STORAGE_KEY = "bailin.locale";

function getNested(dict: TranslationTree, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : ""
  );
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => Promise<void>;
  t: (key: string, params?: TranslationParams) => string;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const nuwa = useNuwa();
  const [locale, setLocaleState] = useState<Locale>("zh");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await nuwa.app.getLocale();
        setLocaleState(stored);
      } catch {
        const fallback = localStorage.getItem(STORAGE_KEY);
        if (fallback === "en" || fallback === "zh") setLocaleState(fallback);
      } finally {
        setReady(true);
      }
    })();
  }, [nuwa]);

  const setLocale = useCallback(
    async (next: Locale) => {
      await nuwa.app.setLocale(next);
      localStorage.setItem(STORAGE_KEY, next);
      setLocaleState(next);
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
    },
    [nuwa]
  );

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslationParams) => {
      const raw = getNested(LOCALES[locale], key) ?? getNested(LOCALES.zh, key) ?? key;
      return interpolate(raw, params);
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): I18nContextValue["t"] {
  return useI18n().t;
}
