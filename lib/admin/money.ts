/**
 * Money helpers for the owner panel (pure). With Adaptive Pricing, invoices and
 * charges are in the BUYER's currency (MXN, COP, BRL…); summing their amounts
 * as USD is wrong. A Stripe balance transaction is always in the account's
 * settlement currency, so revenue is summed from those.
 */

export type BalanceTxn = {
  type: string;
  amount: number; // minor units, settlement currency
  currency: string;
  created: number; // unix seconds
  customer?: string | null;
  /** Billing country (ISO-2) of the underlying charge, when known. */
  country?: string | null;
};

const REVENUE_TYPES = new Set(["charge", "payment"]);

export type Revenue = {
  total: number;
  buckets: number[];
  byCustomer: Record<string, number>;
  countByCustomer: Record<string, number>;
  byCountry: Record<string, number>;
  /** Revenue txns skipped because the settlement currency isn't USD. */
  nonUsd: number;
};

export function revenueFromBalanceTransactions(
  txns: BalanceTxn[],
  bucketOf: (createdMs: number) => number,
  points: number,
): Revenue {
  const out: Revenue = { total: 0, buckets: new Array(points).fill(0), byCustomer: {}, countByCustomer: {}, byCountry: {}, nonUsd: 0 };
  for (const t of txns) {
    if (!REVENUE_TYPES.has(t.type)) continue;
    if ((t.currency || "").toLowerCase() !== "usd") {
      out.nonUsd++;
      continue;
    }
    const usd = (t.amount || 0) / 100;
    out.total += usd;
    out.buckets[bucketOf(t.created * 1000)] += usd;
    if (t.customer) {
      out.byCustomer[t.customer] = (out.byCustomer[t.customer] || 0) + usd;
      out.countByCustomer[t.customer] = (out.countByCustomer[t.customer] || 0) + 1;
    }
    const cc = (t.country || "??").toUpperCase();
    out.byCountry[cc] = (out.byCountry[cc] || 0) + usd;
  }
  // 2-decimals hygiene against float noise
  out.total = Math.round(out.total * 100) / 100;
  out.buckets = out.buckets.map((v) => Math.round(v * 100) / 100);
  return out;
}

/**
 * USD value of an unfinished checkout session: the pre-localisation total when
 * Adaptive Pricing converted it, the total itself when it was already USD,
 * otherwise the plan's USD list price.
 */
export function abandonedAmountUsd(
  s: {
    currency?: string | null;
    amount_total?: number | null;
    currency_conversion?: { amount_total: number; source_currency: string } | null;
  },
  planListPriceUsd: number,
): number {
  const conv = s.currency_conversion;
  if (conv && conv.source_currency?.toLowerCase() === "usd") return conv.amount_total / 100;
  if ((s.currency || "").toLowerCase() === "usd" && s.amount_total) return s.amount_total / 100;
  return planListPriceUsd;
}

/** A row in `subscriptions` that represents a real (not abandoned/ended) sub. */
export function isValidSubStatus(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
