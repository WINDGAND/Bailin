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
  resyncLocale: () => Promise<void>;
  t: (key: string, params?: TranslationParams) => string;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const nuwa = useNuwa();
  const [locale, setLocaleState] = useState<Locale>("zh");
  const [ready, setReady] = useState(false);

  const applyLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await nuwa.app.getLocale();
        applyLocale(stored);
      } catch {
        const fallback = localStorage.getItem(STORAGE_KEY);
        if (fallback === "en" || fallback === "zh") applyLocale(fallback);
      } finally {
        setReady(true);
      }
    })();
  }, [nuwa, applyLocale]);

  useEffect(() => {
    const off = nuwa.on.localeChanged((next) => {
      applyLocale(next);
    });
    return off;
  }, [nuwa, applyLocale]);

  const resyncLocale = useCallback(async () => {
    try {
      applyLocale(await nuwa.app.getLocale());
    } catch {
      const fallback = localStorage.getItem(STORAGE_KEY);
      if (fallback === "en" || fallback === "zh") applyLocale(fallback);
    }
  }, [nuwa, applyLocale]);

  useEffect(() => {
    const resync = () => {
      void resyncLocale();
    };
    window.addEventListener("focus", resync);
    return () => window.removeEventListener("focus", resync);
  }, [resyncLocale]);

  const setLocale = useCallback(
    async (next: Locale) => {
      await nuwa.app.setLocale(next);
      applyLocale(next);
    },
    [nuwa, applyLocale]
  );

  const t = useCallback(
    (key: string, params?: TranslationParams) => {
      const raw = getNested(LOCALES[locale], key) ?? getNested(LOCALES.zh, key) ?? key;
      return interpolate(raw, params);
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, resyncLocale, t, ready }),
    [locale, setLocale, resyncLocale, t, ready]
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
