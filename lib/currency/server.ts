import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { BASE_CURRENCY, QA_CURRENCY_COOKIE, parseCurrencyCode } from "./config";
import { currencyForCountry } from "./country-currency";
import { getUsdRates } from "./rates";
import type { CurrencyContext } from "./format";

const USD: CurrencyContext = { code: BASE_CURRENCY, rate: 1, isConverted: false };

/**
 * The visitor's display currency for this request: QA cookie (`?cur=`) >
 * `x-vercel-ip-country` (same source Stripe and the locale use) > USD. Any
 * missing country, unknown currency or missing rate falls back to USD, and a
 * USD visitor never touches the rates source. Deduped per request.
 */
export const getCurrencyContext = cache(async (): Promise<CurrencyContext> => {
  try {
    const [store, hdrs] = await Promise.all([cookies(), headers()]);
    const qa = parseCurrencyCode(store.get(QA_CURRENCY_COOKIE)?.value);
    const code = qa ?? currencyForCountry(hdrs.get("x-vercel-ip-country"));
    if (code === BASE_CURRENCY) return USD;
    const rate = (await getUsdRates())[code];
    return rate && rate > 0 ? { code, rate, isConverted: true } : USD;
  } catch {
    return USD;
  }
});
