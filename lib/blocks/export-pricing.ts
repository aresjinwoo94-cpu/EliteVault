import "server-only";
import { stripe } from "@/lib/stripe/server";

/**
 * Liquid Blocks WP-D — what an export costs.
 *
 * The amount is NOT in this repo. It lives on the Stripe Price named by
 * STRIPE_PRICE_LIQUID_EXPORT, and everything that displays a price reads it
 * from there. That's deliberate: a number hardcoded here would drift the moment
 * the owner changed the Price in the dashboard, and the version the customer
 * saw before paying would stop matching the version they were charged.
 *
 * Nothing here touches profiles.credits. The export is a standalone purchase,
 * open to any user on any plan — see the header of migration 0035 for why the
 * brief's original credit-based model was dropped.
 */

export interface ExportPrice {
  amountCents: number;
  currency: string;
  /** Ready to render, e.g. "$14.00". */
  formatted: string;
}

/**
 * Shown wherever the export would be offered but can't be. Names the cause
 * plainly instead of dressing a missing environment variable up as a fault of
 * the merchant's — they can neither cause it nor fix it.
 */
export const EXPORT_NOT_CONFIGURED =
  "Downloads aren't switched on yet. Nothing you did — the price for this hasn't been set up on our side. Your preview and your block are saved.";

export function exportPriceId(): string | null {
  const id = process.env.STRIPE_PRICE_LIQUID_EXPORT?.trim();
  return id ? id : null;
}

export function isExportConfigured(): boolean {
  return exportPriceId() !== null;
}

/**
 * Cached for the life of the lambda. The Price is a slow-moving object and
 * every project page would otherwise pay a Stripe round-trip just to render a
 * button label. A cold start picks up a change within minutes.
 */
let cached: { at: number; value: ExportPrice | null } | null = null;
const CACHE_MS = 10 * 60_000;

export async function getExportPrice(): Promise<ExportPrice | null> {
  const id = exportPriceId();
  if (!id) return null;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  try {
    const price = await stripe.prices.retrieve(id);
    const amountCents = price.unit_amount;
    if (typeof amountCents !== "number") {
      // A metered or tiered Price has no flat amount. That's a misconfiguration
      // rather than a runtime condition, so it's loud in the logs and silent to
      // the user — who gets the "not switched on" copy above.
      console.error(
        `[blocks] STRIPE_PRICE_LIQUID_EXPORT (${id}) has no unit_amount — it must be a one-time flat price.`,
      );
      cached = { at: Date.now(), value: null };
      return null;
    }
    if (price.recurring) {
      console.error(
        `[blocks] STRIPE_PRICE_LIQUID_EXPORT (${id}) is a RECURRING price — the export is a one-time purchase.`,
      );
      cached = { at: Date.now(), value: null };
      return null;
    }
    const currency = price.currency.toUpperCase();
    const value: ExportPrice = {
      amountCents,
      currency,
      formatted: formatPrice(amountCents, currency),
    };
    cached = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[blocks] could not read the export price:", (err as Error).message);
    // NOT cached: a Stripe blip shouldn't disable sales for ten minutes.
    return null;
  }
}

export function formatPrice(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amountCents / 100,
    );
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

/** Test seam — the module cache would otherwise leak between cases. */
export function __resetExportPriceCache(): void {
  cached = null;
}
