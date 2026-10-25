/**
 * Thresholds + rounding for the landing's "In use" counters (pure, unit-tested).
 *
 * Rule of the brief: a small number HURTS credibility, so each counter has a
 * minimum below which it is not shown at all, and if fewer than two counters
 * survive the whole block is hidden. Numbers are rounded DOWN and shown as
 * `{n}+`, never rounded up.
 */

export const MIN_AUDITS = 100;
export const MIN_STORES = 50;
export const MIN_AI_VISITS = 20;
export const MIN_VISIBLE_COUNTERS = 2;

/** Round DOWN to a clean figure: tens under 100, fifties under 1,000, hundreds above. */
export function roundDownCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n >= 1000 ? 100 : n >= 100 ? 50 : 10;
  return Math.floor(n / step) * step;
}

export type CounterKey = "audits" | "stores" | "niches";
export type Counter = { key: CounterKey; value: number };

/** `null` = unknown (query failed / not configured) ⇒ that counter is hidden. */
export function visibleCounters(input: {
  audits: number | null;
  stores: number | null;
  niches: number | null;
}): Counter[] {
  const out: Counter[] = [];
  if (input.audits !== null && input.audits >= MIN_AUDITS) {
    out.push({ key: "audits", value: roundDownCount(input.audits) });
  }
  if (input.stores !== null && input.stores >= MIN_STORES) {
    out.push({ key: "stores", value: roundDownCount(input.stores) });
  }
  // A fixed table in the code (11 niches today); shown whenever it is a real
  // number, still subject to the "at least two counters" rule below.
  if (input.niches !== null && input.niches > 0) {
    out.push({ key: "niches", value: input.niches });
  }
  return out.length >= MIN_VISIBLE_COUNTERS ? out : [];
}

/** AI-assistant discovery line: only with real server-side data above the threshold. */
export function aiVisitsToShow(visits: number | null): number | null {
  return visits !== null && visits >= MIN_AI_VISITS ? visits : null;
}
