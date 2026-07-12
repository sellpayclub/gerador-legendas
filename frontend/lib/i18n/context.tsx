"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import pt, { type Messages } from "./locales/pt";
import es from "./locales/es";
import en from "./locales/en";

export type Locale = "pt" | "es" | "en";

const STORAGE_KEY = "clipsaas_locale";

const LOCALES: Record<Locale, Messages> = { pt, es, en };

export const LOCALE_OPTIONS: { id: Locale; flag: string }[] = [
  { id: "pt", flag: "🇧🇷" },
  { id: "es", flag: "🇪🇸" },
  { id: "en", flag: "🇺🇸" },
];

type Params = Record<string, string | number | undefined>;

function getNested(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const val = getNested(LOCALES[locale], key) ?? getNested(pt, key);
  if (typeof val === "string") return interpolate(val, params);
  return key;
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Params) => string;
  messages: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "pt";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "es" || raw === "en" || raw === "pt") return raw;
  return "pt";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("pt");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "pt" ? "pt-BR" : locale === "es" ? "es" : "en";
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Params) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, messages: LOCALES[locale] }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
