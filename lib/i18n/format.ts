import type { Locale } from "./config";

/**
 * BCP-47 tag for Intl formatting of the site's language. Spanish uses the
 * Latin-American variant (dd/mm/yyyy, "USD 19", "," decimals) — the audience
 * the Spanish copy is written for. Pure and import-free so server and client
 * components share it.
 */
export function intlLocale(locale: Locale): string {
  return locale === "es" ? "es-419" : "en-US";
}

export function formatDate(
  value: string | number | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(
    new Date(value),
  );
}

/** Whole-unit currency (plan prices), localised to the site's language. */
export function formatPrice(
  amount: number,
  locale: Locale,
  currency = "USD",
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
