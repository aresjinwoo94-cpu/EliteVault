"use client";

import { createContext, useContext, useMemo } from "react";
import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { translator } from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: Locale;
  /** Translate a dotted key (e.g. "hero.ctaPrimary"); falls back to English. */
  t: (path: string) => string;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  t: (path) => path,
});

/**
 * Wraps the app and exposes the active locale + `t()` to client components.
 * The locale is resolved on the server (cookie) and passed in, so the very
 * first paint is already in the right language.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: translator(locale) }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useT(): LocaleContextValue {
  return useContext(LocaleContext);
}
