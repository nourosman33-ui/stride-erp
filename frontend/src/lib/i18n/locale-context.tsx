"use client";

import * as React from "react";

import en from "./en";
import ar from "./ar";
import type { Dictionary } from "./en";

export type Locale = "en" | "ar";

const DICTIONARIES: Record<Locale, Dictionary> = { en, ar };
const LOCALE_KEY = "stride_locale";

// Dot-path key into the dictionary, e.g. "dashboard.title" — derived from the nested
// Dictionary shape so a typo doesn't silently fall through to the raw key at runtime.
type PathOf<T, Prefix extends string = ""> = T extends string
  ? Prefix extends `${string}.`
    ? `${Prefix}${never}`
    : never
  : {
      [K in keyof T & string]: T[K] extends string
        ? `${Prefix}${K}`
        : PathOf<T[K], `${Prefix}${K}.`>;
    }[keyof T & string];

export type TranslationKey = PathOf<Dictionary>;

function lookup(dict: Dictionary, path: string): string {
  const value = path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : path;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const v = vars[key];
    return v === undefined ? match : String(v);
  });
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("en");

  React.useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === "en" || stored === "ar") {
      setLocaleState(stored);
    }
  }, []);

  const dir: "ltr" | "rtl" = locale === "ar" ? "rtl" : "ltr";

  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = React.useCallback((next: Locale) => {
    window.localStorage.setItem(LOCALE_KEY, next);
    setLocaleState(next);
  }, []);

  const t = React.useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      interpolate(lookup(DICTIONARIES[locale], key), vars),
    [locale],
  );

  const value = React.useMemo(() => ({ locale, setLocale, dir, t }), [locale, setLocale, dir, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
