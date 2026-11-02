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

/**
 * Own compact abbreviation (Intl's differs per locale/ICU: "376.4 k", "1025 M",
 * "K" vs "k"). k / M / B in English; k / M / "mil M" / B in Spanish (where B =
 * 10^12). One decimal only below 10 ("1.4M"), whole numbers above ("146k").
 */
function abbreviate(amount: number, locale: Locale): { scaled: number; suffix: string } | null {
  const abs = Math.abs(amount);
  if (abs < 1000) return null;
  const es = locale === "es";
  const units: [number, string][] = es
    ? [[1e12, " B"], [1e9, " mil M"], [1e6, "M"], [1e3, "k"]]
    : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "k"]];
  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i];
    if (abs < size) continue;
    let scaled = amount / size;
    const rounded = Math.abs(scaled) < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled);
    // 999.6k rounds to 1000k → promote to the next unit up.
    if (Math.abs(rounded) >= 1000 && i > 0) {
      const [up, upSuffix] = units[i - 1];
      scaled = amount / up;
      return { scaled: Math.abs(scaled) < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled), suffix: upSuffix };
    }
    return { scaled: rounded, suffix };
  }
  return null;
}

function formatLocal(
  amount: number,
  code: string,
  locale: Locale,
  opts: MoneyOpts & { exactDecimals?: number },
): string {
  const digits = opts.exactDecimals ?? fractionDigits(code, opts.kind);
  const abbr = opts.compact ? abbreviate(amount, locale) : null;
  if (abbr) {
    const base = formatLocal(abbr.scaled, code, locale, {
      kind: "price",
      exactDecimals: Number.isInteger(abbr.scaled) ? 0 : 1,
    });
    return `${base}${abbr.suffix}`;
  }
  const fmt = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: code,
    // narrowSymbol only for USD ("$"); everyone else keeps the unambiguous
    // symbol/code (MX$, CA$, R$, COP…) so a "$" never means two currencies.
    currencyDisplay: code === BASE_CURRENCY ? "narrowSymbol" : "symbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (code === BASE_CURRENCY) return fmt.format(amount);
  // Safety net: some locales/ICU builds still print a bare "$" for MXN etc.
  return fmt
    .formatToParts(amount)
    .map((p) => (p.type === "currency" && p.value === "$" ? `${code} ` : p.value))
    .join("");
}

/** A non-USD context with a usable rate; anything else displays as USD. */
function isConvertible(ctx: Pick<MoneyCtx, "code" | "rate">): boolean {
  return ctx.code !== BASE_CURRENCY && Number.isFinite(ctx.rate) && ctx.rate > 0;
}

/**
 * Display a USD amount in the visitor's currency. Presentation only — the
 * engine, the DB and Stripe stay in USD. USD in → identical to the old `$`
 * formatting, never "≈".
 */
export function formatMoney(usd: number, ctx: MoneyCtx, opts: MoneyOpts = {}): string {
  const converted = isConvertible(ctx);
  const amount = converted ? usd * ctx.rate : usd;
  const text = formatLocal(amount, converted ? ctx.code : BASE_CURRENCY, ctx.locale, opts);
  return converted && opts.approx ? `≈ ${text}` : text;
}

/**
 * Clean, rounded-UP local figure for a plan/unlock price: market rate +
 * ADAPTIVE_PRICING_BUFFER, then up to a tidy step (<10 → 0.5, <100 → 1, else a tenth of
 * the magnitude: 355 → 360, 79,040 → 80,000). Better that Stripe shows a hair
 * less than we promised than a hair more. USD is returned untouched.
 */
export function planPriceLocal(usd: number, ctx: Pick<MoneyCtx, "code" | "rate">): number {
  if (!isConvertible(ctx)) return usd;
  const raw = usd * ctx.rate * (1 + ADAPTIVE_PRICING_BUFFER);
  if (!(raw > 0)) return raw;
  const step = raw < 10 ? 0.5 : raw < 100 ? 1 : 10 ** (Math.floor(Math.log10(raw)) - 1);
  return Math.ceil(raw / step - 1e-9) * step;
}

/** Plan/unlock price in the visitor's currency (buffered, rounded up). */
export function formatPlanPrice(usd: number, ctx: MoneyCtx, opts: Pick<MoneyOpts, "approx"> = {}): string {
  if (!isConvertible(ctx)) return formatLocal(usd, BASE_CURRENCY, ctx.locale, { kind: "price" });
  const local = planPriceLocal(usd, ctx);
  const text = formatLocal(local, ctx.code, ctx.locale, {
    kind: "price",
    exactDecimals: Number.isInteger(local) ? 0 : 1, // only the 0.5 steps
  });
  return opts.approx ? `≈ ${text}` : text;
}

/** Whether plan/unlock prices may be shown in this currency (else USD only). */
export function planShowsLocal(ctx: Pick<MoneyCtx, "code">): boolean {
  return ctx.code !== BASE_CURRENCY && isAdaptiveSupported(ctx.code);
}
