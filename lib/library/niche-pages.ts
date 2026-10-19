import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { measuredActiveAds } from "@/lib/library/ad-signal";

/**
 * Data layer for the programmatic SEO pages /winning-shopify-stores/[niche].
 *
 * Each Library niche with enough entries becomes an indexable landing
 * ("winning skincare shopify stores", …) — long-tail keywords where the
 * generic "winning shopify stores" listicles (Shopify blog, Oberlo…)
 * don't compete with a dedicated, data-backed page.
 *
 * MIN_STORES guards against thin content: a "winning X stores" page with
 * one store reads as spam to Google and to humans. Niches below the
 * threshold simply don't get a page (404) until the Library grows.
 */

// The taxonomy itself lives in lib/library/niches.ts, which is free of
// `server-only` so the CLI jobs in scripts/library/ can share it. Re-exported
// here so every existing `from "@/lib/library/niche-pages"` import is unchanged.
import { NICHE_LABELS, MIN_STORES } from "@/lib/library/niches";
export { NICHE_LABELS, MIN_STORES };

export interface NicheStore {
  title: string;
  domain: string;
  thumbnailUrl: string | null;
  featured: boolean;
  /** The home really shows Shopify signals (store_checks). Badge only. */
  shopifyVerified: boolean;
  /** Active Meta ads — ONLY a real, fresh Meta Ad Library measurement; null otherwise. */
  measuredAds: number | null;
}

export interface NichePageData {
  slug: string;
  label: string;
  plural: string;
  stores: NicheStore[];
}

function toThumb(url: string | null): string | null {
  if (!url || !url.includes("/storage/v1/object/public/")) return null;
  return `${url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  )}?width=800&quality=70`;
}

/** Niches that currently qualify for a page (used by sitemap + hub links). */
export async function getQualifyingNiches(): Promise<
  { slug: string; label: string; count: number }[]
> {
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("winning_sites")
      .select("niche")
      .eq("status", "published")
      .eq("is_live", true);
    if (!Array.isArray(data)) return [];
    const counts = new Map<string, number>();
    for (const row of data as unknown as { niche: string }[]) {
      counts.set(row.niche, (counts.get(row.niche) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([slug, n]) => n >= MIN_STORES && NICHE_LABELS[slug])
      .map(([slug, count]) => ({
        slug,
        label: NICHE_LABELS[slug].label,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

/** Full data for one niche page, or null → 404. */
export async function getNichePage(slug: string): Promise<NichePageData | null> {
  const meta = NICHE_LABELS[slug];
  if (!meta) return null;
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("winning_sites")
      .select("title, domain, niche, thumbnail_url, is_featured, ad_signals, active_ads_count, shopify_verified")
      .eq("niche", slug)
      .eq("status", "published")
      .eq("is_live", true);
    if (!Array.isArray(data) || data.length < MIN_STORES) return null;
    const stores = (
      data as unknown as {
        title: string;
        domain: string;
        thumbnail_url: string | null;
        is_featured: boolean;
        ad_signals: Record<string, unknown> | null;
        active_ads_count: number | null;
        shopify_verified: boolean | null;
      }[]
    )
      .map((row) => ({
        title: row.title,
        domain: row.domain,
        thumbnailUrl: toThumb(row.thumbnail_url),
        featured: row.is_featured,
        shopifyVerified: row.shopify_verified === true,
        measuredAds: measuredActiveAds({ active_ads_count: row.active_ads_count, ad_signals: row.ad_signals })?.count ?? null,
      }))
      // No estimate decides the order: curated first, then REAL measured ad counts, then name.
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          (b.measuredAds ?? 0) - (a.measuredAds ?? 0) ||
          a.title.localeCompare(b.title),
      );
    return { slug, label: meta.label, plural: meta.plural, stores };
  } catch {
    return null;
  }
}
