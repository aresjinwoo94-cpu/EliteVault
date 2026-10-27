/**
 * QA-only currency override, no UI: `?cur=MXN` (handled in middleware.ts)
 * stores the code in this SESSION cookie and it beats the visitor's country.
 * `?cur=auto` clears it. Same pattern as QA_LOCALE_COOKIE.
 */
export const QA_CURRENCY_COOKIE = "EV_CUR_QA";

/** Everything the engine, the DB and Stripe speak. Display-only conversion. */
export const BASE_CURRENCY = "USD";

/** A 3-letter ISO 4217 code, upper-cased, or null. */
export function parseCurrencyCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(code) ? code : null;
}
