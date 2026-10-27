import type { Locale } from "@/lib/i18n/config";
import { intlLocale } from "@/lib/i18n/format";
import { BASE_CURRENCY } from "./config";
import { isAdaptiveSupported } from "./adaptive-supported";

/** What the server resolves per request and hands to the client. */
export type CurrencyContext = {
  code: string;
  /** Units of `code` per 1 USD. Always 1 for USD. */
  rate: number;
  /** false for USD — nothing is converted, so no "≈". */
  isConverted: boolean;
};

export type MoneyCtx = { code: string; rate: number; locale: Locale };

export type MoneyOpts = {
  /** price/metric → whole units; small (CPC, CPM, CPA) → 2 decimals. */
  kind?: "price" | "metric" | "small";
  /** Prepends "≈ " when the amount was converted. */
  approx?: boolean;
  /** 1.4M instead of 1,400,000 (potential bands, big budgets). */
  compact?: boolean;
};

/** Stripe's Adaptive Pricing adds a 2–4% conversion fee; we show the top. */
export const ADAPTIVE_PRICING_BUFFER = 0.04;

/** Currencies whose unit is so small that cents are noise. */
const WHOLE_UNIT = new Set([
  "JPY", "KRW", "CLP", "COP", "ARS", "PYG", "VND", "IDR", "HUF", "UGX", "XAF",
  "XOF", "XPF", "RWF", "GNF", "KHR", "MGA", "BIF", "DJF", "TZS", "UZS", "IRR",
]);

function fractionDigits(code: string, kind: MoneyOpts["kind"]): number {
  if (kind !== "small") return 0;
  if (WHOLE_UNIT.has(code)) return 0;
  return 2;
}

function formatLocal(amount: number, code: string, locale: Locale, opts: MoneyOpts): string {
  const digits = fractionDigits(code, opts.kind);
  const fmt = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: code,
    // narrowSymbol only for USD ("$"); everyone else keeps the unambiguous
    // symbol/code (MX$, CA$, R$, COP…) so a "$" never means two currencies.
    currencyDisplay: code === BASE_CURRENCY ? "narrowSymbol" : "symbol",
    minimumFractionDigits: opts.compact ? 0 : digits,
    maximumFractionDigits: opts.compact ? Math.max(digits, 1) : digits,
    ...(opts.compact ? { notation: "compact" as const } : {}),
  });
  if (code === BASE_CURRENCY) return fmt.format(amount);
  // Safety net: some locales/ICU builds still print a bare "$" for MXN etc.
  return fmt
    .formatToParts(amount)
    .map((p) => (p.type === "currency" && p.value === "$" ? `${code} ` : p.value))
    .join("");
}

/**
 * Display a USD amount in the visitor's currency. Presentation only — the
 * engine, the DB and Stripe stay in USD. USD in → identical to the old `$`
 * formatting, never "≈".
 */
export function formatMoney(usd: number, ctx: MoneyCtx, opts: MoneyOpts = {}): string {
  const converted = ctx.code !== BASE_CURRENCY;
  const amount = converted ? usd * ctx.rate : usd;
  const text = formatLocal(amount, converted ? ctx.code : BASE_CURRENCY, ctx.locale, opts);
  return converted && opts.approx ? `≈ ${text}` : text;
}

/**
 * Clean, rounded-UP local figure for a plan/unlock price: market rate +
 * ADAPTIVE_PRICING_BUFFER, then up to a tidy step (<100 → 1, else a tenth of
 * the magnitude: 355 → 360, 79,040 → 80,000). Better that Stripe shows a hair
 * less than we promised than a hair more. USD is returned untouched.
 */
export function planPriceLocal(usd: number, ctx: Pick<MoneyCtx, "code" | "rate">): number {
  if (ctx.code === BASE_CURRENCY) return usd;
  const raw = usd * ctx.rate * (1 + ADAPTIVE_PRICING_BUFFER);
  if (!(raw > 0)) return raw;
  const step = raw < 100 ? 1 : 10 ** (Math.floor(Math.log10(raw)) - 1);
  return Math.ceil(raw / step - 1e-9) * step;
}

/** Plan/unlock price in the visitor's currency (buffered, rounded up). */
export function formatPlanPrice(usd: number, ctx: MoneyCtx, opts: Pick<MoneyOpts, "approx"> = {}): string {
  if (ctx.code === BASE_CURRENCY) return formatLocal(usd, BASE_CURRENCY, ctx.locale, { kind: "price" });
  const text = formatLocal(planPriceLocal(usd, ctx), ctx.code, ctx.locale, { kind: "price" });
  return opts.approx ? `≈ ${text}` : text;
}

/** Whether plan/unlock prices may be shown in this currency (else USD only). */
export function planShowsLocal(ctx: Pick<MoneyCtx, "code">): boolean {
  return ctx.code !== BASE_CURRENCY && isAdaptiveSupported(ctx.code);
}
