"use client";

import { createContext, useContext, useMemo } from "react";
import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { lookup, type Dict } from "@/lib/i18n/lookup";

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
 * The locale is resolved on the server and passed in, so the very first paint
 * is already in the right language.
 *
 * `messages` is the server-built client dictionary (clientMessages()): the
 * ACTIVE language only, and only the namespaces client code reads. It arrives
 * as a prop instead of being imported so the browser bundle carries no
 * dictionary at all — importing the dictionary module here used to ship both
 * languages in full to every page.
 */
export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Dict;
  children: React.ReactNode;
}) {
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: (path) => lookup(messages, path) ?? path }),
    [locale, messages],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useT(): LocaleContextValue {
  return useContext(LocaleContext);
}
