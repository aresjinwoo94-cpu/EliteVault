import type { BandUsd } from "@/lib/growth-map/ranks";
import { BASE_CURRENCY } from "./config";
import { formatMoney, type MoneyCtx } from "./format";

export type BandLabels = {
  /** "/mo" | "/mes" */
  perMonth: string;
  /** "first sales" | "primeras ventas" */
  firstSales: string;
};

/**
 * The $ potential band in the visitor's currency.
 *
 *  - USD (or an unusable rate): returns `legacy` untouched, so today's text
 *    ("~$20k–80k/mo", "$0 – first sales", "$1M+/mo") never changes.
 *  - Otherwise: "≈ MX$360K–MX$1.4M/mo", "≈ MX$18M+/mo", "MX$0 – primeras ventas".
 *
 * It stays an orientative stage band, never a claim about the store's revenue;
 * the caller keeps its own "not your revenue" caveat.
 */
export function formatBand(
  band: BandUsd,
  legacy: string,
  ctx: MoneyCtx | null,
  labels: BandLabels,
): string {
  if (!ctx || ctx.code === BASE_CURRENCY || !Number.isFinite(ctx.rate) || ctx.rate <= 0) return legacy;
  const money = (usd: number, approx = false) => formatMoney(usd, ctx, { compact: true, approx });
  const per = band.perMonth ? labels.perMonth : "";
  if (band.max === 0) return `${money(0)} – ${labels.firstSales}`;
  if (band.max === null) return `${money(band.min, true)}+${per}`;
  return `${money(band.min, true)}–${money(band.max)}${per}`;
}
