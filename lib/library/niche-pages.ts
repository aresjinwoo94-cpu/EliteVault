import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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
  convRate: number | null;
  featured: boolean;
}

export interface NichePageData {
  slug: string;
  label: string;
  plural: string;
  stores: NicheStore[];
  avgConv: number | null;
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
    const { data } = await service.from("winning_sites").select("niche");
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
      .select("title, domain, niche, thumbnail_url, metrics, is_featured")
      .eq("niche", slug);
    if (!Array.isArray(data) || data.length < MIN_STORES) return null;
    const stores = (
      data as unknown as {
        title: string;
        domain: string;
        thumbnail_url: string | null;
        metrics: { conv_rate?: number } | null;
        is_featured: boolean;
      }[]
    )
      .map((row) => ({
        title: row.title,
        domain: row.domain,
        thumbnailUrl: toThumb(row.thumbnail_url),
        convRate:
          typeof row.metrics?.conv_rate === "number"
            ? row.metrics.conv_rate
            : null,
        featured: row.is_featured,
      }))
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          (b.convRate ?? 0) - (a.convRate ?? 0),
      );
    const rates = stores.map((s) => s.convRate).filter((r): r is number => r != null);
    return {
      slug,
      label: meta.label,
      plural: meta.plural,
      stores,
      avgConv: rates.length
        ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
        : null,
    };
  } catch {
    return null;
  }
}
