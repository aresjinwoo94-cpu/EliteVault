/**
 * i18n configuration — cookie-based locale, no URL routing.
 *
 * We intentionally do NOT use locale URL segments (/es/...). That would
 * require rewriting every internal link, redirect, canonical and the auth
 * middleware — high blast radius. Instead the active locale lives in a
 * cookie (NEXT_LOCALE); the root layout reads it server-side and the whole
 * tree re-renders in that language. Any string without a translation falls
 * back to English, so partial coverage can never break a page.
 */
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie name. `NEXT_LOCALE` is the de-facto standard many tools read. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** One year — the choice should persist across visits. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "es";
}
