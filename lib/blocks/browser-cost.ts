import "server-only";
import { recordUsage } from "@/lib/usage/meter";

/**
 * Liquid Blocks WP-E — the part of the COGS that isn't inference.
 *
 * Every other feature's cost is tokens, so `usage_events` was built around
 * them. Blocks is the first thing here whose expensive step is a headless
 * Chromium: a cold start plus a real storefront's page load plus two captures
 * is seconds of compute per preview, and it is invisible in a ledger that only
 * counts tokens. A merchant who re-measures ten times costs real money and
 * shows up as almost nothing.
 *
 * # Why the cost is usually zero, and why that's the honest answer
 * The DURATION is measured — it's a fact. The price per second is not
 * something this repo can know: it depends on the plan, the memory setting and
 * the region, and inventing a plausible rate would put a fabricated number in
 * the same column as the AI costs, which are real. So the rate comes from
 * BLOCKS_BROWSER_USD_PER_SECOND and defaults to 0.
 *
 * That gives a ledger that is never wrong: with no rate set you get accurate
 * durations and an explicit zero cost, and the moment the owner supplies a rate
 * from their actual bill, every subsequent row is right. `meta.durationMs` is
 * recorded either way, so a rate set later can be applied retroactively to rows
 * already stored.
 */

function usdPerSecond(): number {
  const raw = Number(process.env.BLOCKS_BROWSER_USD_PER_SECOND);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

/**
 * Record one headless-browser session against the Blocks feature.
 *
 * Best-effort in exactly the way recordUsage is: it must never throw and never
 * delay the caller. Losing a cost row is acceptable; failing a preview the
 * merchant is watching is not.
 */
export function recordBrowserCost(opts: {
  userId: string | null;
  projectId: string;
  durationMs: number;
  /** False when the session ended in a failure — still real compute spent. */
  succeeded: boolean;
}): void {
  try {
    const seconds = Math.max(0, opts.durationMs) / 1000;
    const estCostUsd = Number((seconds * usdPerSecond()).toFixed(6));
    recordUsage({
      eventType: "blocks",
      userId: opts.userId,
      // Not an inference call, so there are no tokens — and pretending there
      // were would corrupt the token totals the cost page sums.
      provider: "browser",
      model: "chromium",
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      // Without this the row lands at 0 whatever the rate: recordUsage prices
      // by MODEL, and "chromium" isn't in that table. The browser cost would
      // sit in `meta` where nothing sums it.
      estCostUsdOverride: estCostUsd,
      meta: {
        projectId: opts.projectId,
        phase: "preview_browser",
        durationMs: Math.round(opts.durationMs),
        succeeded: opts.succeeded,
        // Stamped on the row so a rate configured LATER can be applied to rows
        // already written, instead of the history being unrecoverable.
        usdPerSecond: usdPerSecond(),
        estCostUsd,
      },
    });
  } catch (err) {
    console.warn("[blocks] browser cost not recorded:", (err as Error).message);
  }
}
