/**
 * When may the UI call an ad count a MEASUREMENT?
 *
 * The "N active ads" badge is styled and worded as a live, factual signal ("Real signal —
 * live Meta Ad Library count"). That is only true for a number that
 *   (a) was returned by the Meta Ad Library API by `library:momentum`, and
 *   (b) is recent.
 * Everything else in `winning_sites.active_ads_count` is a SEED: the discovery agent invents
 * "simulated proxies", older rows were hand-filled, and `ads_last_checked_at` is stamped on
 * every momentum run whether or not Meta answered — so neither a count nor a timestamp proves
 * a measurement. The only proof is an explicit marker that is written exclusively on a real
 * Meta response:
 *
 *   ad_signals = { …, source: "meta_ad_library", measured_at: <ISO>, estimated: false }
 *
 * Until the Meta token works again NO row carries that marker, so the badge shows nowhere.
 * Pure and dependency-free so the rule is directly testable.
 */

export const AD_SOURCE_META = "meta_ad_library";
/** Older than this, a count is stale and is no longer presented as current. */
export const AD_MEASUREMENT_MAX_AGE_DAYS = 30;

export interface AdSignalsLike {
  active_ads?: unknown;
  estimated?: unknown;
  source?: unknown;
  measured_at?: unknown;
}

const DAY_MS = 86_400_000;

/** True only for an ISO timestamp that is not in the future and is ≤ 30 days old. */
export function isFreshMeasurement(measuredAt: unknown, now: number = Date.now()): boolean {
  if (typeof measuredAt !== "string") return false;
  const t = Date.parse(measuredAt);
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  return age >= -5 * 60_000 && age <= AD_MEASUREMENT_MAX_AGE_DAYS * DAY_MS;
}

/**
 * The displayable, MEASURED active-ads count of a row — or null (⇒ the badge is hidden).
 * `estimated: true` never qualifies, whatever else the row says.
 */
export function measuredActiveAds(
  row: { active_ads_count?: unknown; ad_signals?: AdSignalsLike | null },
  now: number = Date.now(),
): { count: number; measuredAt: string } | null {
  const s = row.ad_signals;
  if (!s || typeof s !== "object") return null;
  if (s.estimated === true) return null;
  if (s.source !== AD_SOURCE_META) return null;
  if (!isFreshMeasurement(s.measured_at, now)) return null;
  const n = row.active_ads_count;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return { count: Math.round(n), measuredAt: s.measured_at as string };
}

/**
 * The ONLY way to build the proof of measurement. Call it exclusively with a count that the
 * Meta Ad Library API actually returned (never a seed, an estimate or an agent's guess).
 */
export function withMeasurement(prev: Record<string, unknown> | null | undefined, count: number, nowIso: string): Record<string, unknown> {
  return { ...(prev ?? {}), active_ads: count, source: AD_SOURCE_META, measured_at: nowIso, estimated: false };
}

/**
 * Seeds (discovery agent, expand-library, hand-filled rows) must never carry the proof: drop any
 * `source` / `measured_at` an AI or a script may have put in `ad_signals`.
 */
export function stripMeasurementProof<T extends Record<string, unknown> | null | undefined>(signals: T): T {
  if (!signals || typeof signals !== "object") return signals;
  const { source: _s, measured_at: _m, ...rest } = signals as Record<string, unknown>;
  void _s;
  void _m;
  return rest as T;
}
