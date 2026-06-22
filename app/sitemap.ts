import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { allPosts } from "@/lib/blog/posts";

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
    {
      url: `${baseUrl}/free-website-audit`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/ai-buyer-persona-simulator`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/meta-ads-forecast`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/winning-shopify-stores`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/support`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/docs/api`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/support/contact`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
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

  // Blog — the organic-search content surface. Index + each guide.
  const blogEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...allPosts().map(
      (p): MetadataRoute.Sitemap[number] => ({
        url: `${baseUrl}/blog/${p.slug}`,
        lastModified: new Date(`${p.updated ?? p.date}T00:00:00Z`),
        changeFrequency: "monthly",
        priority: 0.7,
      }),
    ),
  ];

  // NOTE: community audits live under /app/community/* which robots.txt
  // disallows (the whole /app/* dashboard is crawler-blocked). Listing them
  // here would just create "submitted URL blocked by robots.txt" warnings, so
  // the public, logged-out-friendly /s/<slug> shares below are the indexable
  // programmatic surface instead.

  // Public shareable audits (/s/<slug>) — the real logged-out-friendly,
  // indexable content (each is a unique store diagnosis). Stored as
  // analyses.share_slug; served by the public get_shared_audit RPC.
  let sharedEntries: MetadataRoute.Sitemap = [];
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("analyses")
      .select("share_slug, finished_at")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .not("share_slug", "is", null as any)
      .eq("status", "succeeded")
      .order("finished_at", { ascending: false })
      .limit(1000);
    if (Array.isArray(data)) {
      sharedEntries = data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => row?.share_slug)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any) => ({
          url: `${baseUrl}/s/${row.share_slug}`,
          lastModified: row.finished_at ? new Date(row.finished_at) : now,
          changeFrequency: "monthly" as const,
          priority: 0.6,
        }));
    }
  } catch (err) {
    console.warn("[sitemap] shared audits fetch failed:", (err as Error).message);
  }

  return [...staticEntries, ...blogEntries, ...sharedEntries];
}
