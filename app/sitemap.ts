import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Dynamic sitemap.xml at /sitemap.xml
 *
 * Combines:
 *   • Static marketing routes (/, /pricing, sign-in, sign-up)
 *   • Dynamic community audit pages (the SEO-valuable ones — each is a
 *     real-content page with a unique URL, score, niche, summary)
 *
 * We fetch community pages via the service client (no RLS gate) so the
 * sitemap stays accurate. Cached at the edge for the default Next revalidate.
 */

export const revalidate = 3600; // refresh hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

  const now = new Date();

  // Static marketing pages — high priority, change rarely
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    ...["/legal/privacy", "/legal/terms", "/legal/refunds"].map(
      (path): MetadataRoute.Sitemap[number] => ({
        url: `${baseUrl}${path}`,
        lastModified: now,
        changeFrequency: "yearly",
        priority: 0.3,
      }),
    ),
  ];

  // Dynamic community audits — they're public, indexable, and each has
  // unique content. These drive long-tail search ("audit shopify hair store"
  // etc.) once Google indexes them.
  let communityEntries: MetadataRoute.Sitemap = [];
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("community_analyses")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("slug, created_at")
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(500); // sitemap soft-cap

    if (Array.isArray(data)) {
      communityEntries = data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => row?.slug)
        .map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (row: any) => ({
            url: `${baseUrl}/app/community/${row.slug}`,
            lastModified: row.created_at
              ? new Date(row.created_at)
              : now,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          }),
        );
    }
  } catch (err) {
    console.warn("[sitemap] community fetch failed:", (err as Error).message);
    // Soft-fail: ship a sitemap with just static routes rather than a 500
  }

  return [...staticEntries, ...communityEntries];
}
