/**
 * Currencies Stripe Adaptive Pricing can charge in.
 * Source: https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing
 * ("Supported currencies"), read 2026-10-26. Not in this list (e.g. ARS, VES,
 * NGN, EGP) → plan/unlock prices show USD only ("Billed in USD").
 * Customers pay a 2–4% conversion fee on top of the mid-market rate.
 */
export const ADAPTIVE_SUPPORTED: ReadonlySet<string> = new Set(
  (
    "AED AFN ALL AMD AOA AUD AWG AZN BAM BBD BDT BIF BMD BND BOB BRL BSD BWP BZD CAD " +
    "CHF CLP CNY COP CRC CVE CZK DJF DKK DOP DZD EUR FKP GBP GEL GIP GMD GNF GTQ GYD " +
    "HKD HNL HTG HUF IDR ILS INR ISK JMD JPY KES KGS KHR KRW KYD KZT LKR LRD MAD MDL " +
    "MGA MKD MNT MOP MUR MVR MXN MYR MZN NAD NOK NPR NZD PAB PEN PHP PKR PLN PYG QAR " +
    "RON RSD RWF SAR SEK SGD SHP THB TJS TRY TTD TWD TZS UAH UGX USD UYU UZS VND XAF " +
    "XCD XOF XPF YER ZAR ZMW"
  ).split(" "),
);

export function isAdaptiveSupported(code: string): boolean {
  return ADAPTIVE_SUPPORTED.has(code);
}
