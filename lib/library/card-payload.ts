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

/**
 * A LOCKED Library card (Free plan, beyond the preselected winners). Gating happens on the SERVER: the name, the
 * link, the domain, the description, the teardown, the Shopify badge and the ad count are NOT sent at all, so
 * they cannot be read from devtools. Only an opaque id, the niche and a tiny low-quality thumbnail (blurred in
 * the UI) remain. External thumbnails cannot be downscaled, so they are dropped (the card shows a placeholder).
 */
export const LOCKED_THUMB_PARAMS = "?width=80&quality=20";

export function lockedThumb(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return null;
  return `${url.replace(marker, "/storage/v1/render/image/public/").split("?")[0]}${LOCKED_THUMB_PARAMS}`;
}

export function toLockedPayload(raw: Record<string, unknown>) {
  return {
    id: raw.id as string,
    niche: raw.niche as string,
    thumbnail_url: lockedThumb(raw.thumbnail_url) as string | null,
    metrics: null,
    metrics_locked: true as const,
    is_featured: false,
    title: "",
    url: "",
    domain: "",
    description: null,
    teardown: null,
    shopify_verified: null,
    measured_ads: null,
  };
}
