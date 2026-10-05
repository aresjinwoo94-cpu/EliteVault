"use client";

import { createContext, useContext, useMemo } from "react";
import { defaultLocale, type Locale } from "@/lib/i18n/config";
import { lookup, type Dict } from "@/lib/i18n/lookup";

type LocaleContextValue = {
  locale: Locale;
  /** Translate a dotted key (e.g. "hero.ctaPrimary"); falls back to English. */
  t: (path: string) => string;
  /** The dictionary this subtree reads (extended by <LocaleScope>). */
  messages: Dict;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  t: (path) => path,
  messages: {},
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
    () => ({ locale, t: (path) => lookup(messages, path) ?? path, messages }),
    [locale, messages],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/**
 * Adds more messages (the `app` scope) to the dictionary of everything below it.
 * Mounted by the signed-in app layout and the public report pages so that
 * landing/pricing/blog visits never download app-only copy.
 */
export function LocaleScope({
  messages: extra,
  children,
}: {
  messages: Dict;
  children: React.ReactNode;
}) {
  const parent = useContext(LocaleContext);
  const value = useMemo<LocaleContextValue>(() => {
    const merged: Dict = { ...parent.messages };
    for (const [k, v] of Object.entries(extra)) {
      const cur = merged[k];
      merged[k] =
        typeof cur === "object" && typeof v === "object" ? { ...cur, ...v } : v;
    }
    return {
      locale: parent.locale,
      t: (path) => lookup(merged, path) ?? path,
      messages: merged,
    };
  }, [parent, extra]);
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useT(): LocaleContextValue {
  return useContext(LocaleContext);
}
