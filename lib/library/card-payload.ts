import { measuredActiveAds, type AdSignalsLike } from "@/lib/library/ad-signal";

/**
 * What a Library card is allowed to carry to the browser regarding ads (brief oct-2026 §L3, owner decision L-D1).
 *
 * `ad_signals` and `active_ads_count` mix seeds, AI estimates and real Meta Ad Library measurements. The browser
 * gets ONE derived field, `measured_ads`, which is non-null only for a real, fresh measurement
 * (measuredActiveAds), and never the raw fields. Pure and dependency-free so the rule is directly testable.
 */
export function toCardPayload<T extends Record<string, unknown>>(
  raw: T,
): Omit<T, "ad_signals" | "active_ads_count"> & { measured_ads: number | null } {
  const { ad_signals, active_ads_count, ...rest } = raw;
  const measured = measuredActiveAds({
    active_ads_count,
    ad_signals: (ad_signals ?? null) as AdSignalsLike | null,
  });
  return { ...rest, measured_ads: measured?.count ?? null } as Omit<T, "ad_signals" | "active_ads_count"> & {
    measured_ads: number | null;
  };
}
