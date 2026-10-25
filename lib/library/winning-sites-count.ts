import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Public count of winning stores for the landing's trust band.
 *
 * Same credibility filter as lib/library/niche-winners.ts (`status='published'
 * AND is_live=true`), so the number never counts drafts or dead storefronts.
 *
 * The landing is `force-dynamic`, so the count is cached (6 h) instead of
 * hitting the DB on every visit, and the call is raced against a short timeout.
 * Anything wrong — query error, timeout, or fewer than MIN_STORES_FOR_NUMBER
 * stores — resolves to `null` and the seal shows WITHOUT a number. It must never
 * throw and never hold the landing up. No third-party calls here.
 */
export const MIN_STORES_FOR_NUMBER = 50;
const REVALIDATE_SECONDS = 6 * 60 * 60;
const TIMEOUT_MS = 1500;

const fetchCount = unstable_cache(
  async (): Promise<number> => {
    const svc = createSupabaseServiceClient();
    const { count, error } = await svc
      .from("winning_sites")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("is_live", true);
    // Throw on failure so a transient error is NOT cached for 6 hours.
    if (error || typeof count !== "number") throw new Error("winning_sites count failed");
    return count;
  },
  ["landing-winning-sites-count"],
  { revalidate: REVALIDATE_SECONDS },
);

/** Round DOWN to a clean figure: tens under 100, hundreds above. */
export function roundDownStoreCount(n: number): number {
  const step = n >= 100 ? 100 : 10;
  return Math.floor(n / step) * step;
}

/** Raw published+live store count (throws on failure; callers wrap it). */
export const getWinningStoresCountRaw = fetchCount;

/** Rounded store count, or null ⇒ render the seal without a number. */
export async function getWinningStoresCountRounded(): Promise<number | null> {
  try {
    const n = await Promise.race<number | null>([
      fetchCount(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (n === null || n < MIN_STORES_FOR_NUMBER) return null;
    return roundDownStoreCount(n);
  } catch {
    return null;
  }
}
