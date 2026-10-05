/**
 * i18n configuration — automatic locale, no URL routing.
 *
 * We intentionally do NOT use locale URL segments (/es/...). That would
 * require rewriting every internal link, redirect, canonical and the auth
 * middleware — high blast radius. The locale is resolved per request on the
 * server (lib/i18n/server.ts → lib/i18n/detect.ts) and the whole tree renders
 * in that language. Any string without a translation falls back to English,
 * so partial coverage can never break a page.
 */
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/**
 * QA-only language override, no UI: `?lang=en|es` (handled in middleware.ts)
 * stores it in this SESSION cookie and it beats the automatic detection.
 * The old `NEXT_LOCALE` cookie from the removed EN/ES button is ignored.
 */
export const QA_LOCALE_COOKIE = "EV_LANG_QA";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "es";
}
