import type { MetadataRoute } from "next";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { allPosts } from "@/lib/blog/posts";
import { getQualifyingNiches } from "@/lib/library/niche-pages";
import { isShareIndexable } from "@/lib/analyzer/share-policy";

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
      url: `${baseUrl}/convertmate-alternative`,
      lastModified: now,
      changeFrequency: "monthly",
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

  // Programmatic niche pages (/winning-shopify-stores/[niche]) — one per
  // Library niche with enough stores. Each dynamic source is isolated in its
  // own try/catch: if getQualifyingNiches() throws (DB down, RPC changed),
  // this block degrades to [] instead of taking the WHOLE sitemap to a 500 —
  // which would leave Google unable to read even the static money pages (the
  // "only the home is indexed" symptom).
  let nicheEntries: MetadataRoute.Sitemap = [];
  try {
    nicheEntries = (await getQualifyingNiches()).map((n) => ({
      url: `${baseUrl}/winning-shopify-stores/${n.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.warn("[sitemap] niche pages fetch failed:", (err as Error).message);
  }

  // Blog — the organic-search content surface. Index + each guide. allPosts()
  // is in-memory today, but isolate it too so a future data-backed source can
  // never sink the static routes. The /blog index is a static route, so it
  // lives in staticEntries above; here we only add the per-post URLs.
  let blogEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
  try {
    blogEntries = [
      ...blogEntries,
      ...allPosts().map(
        (p): MetadataRoute.Sitemap[number] => ({
          url: `${baseUrl}/blog/${p.slug}`,
          lastModified: new Date(`${p.updated ?? p.date}T00:00:00Z`),
          changeFrequency: "monthly",
          priority: 0.7,
        }),
      ),
    ];
  } catch (err) {
    console.warn("[sitemap] blog posts fetch failed:", (err as Error).message);
  }

  // NOTE: community audits live under /app/community/* which robots.txt
  // disallows (the whole /app/* dashboard is crawler-blocked). Listing them
  // here would just create "submitted URL blocked by robots.txt" warnings, so
  // the public, logged-out-friendly /s/<slug> shares below are the indexable
  // programmatic surface instead.

  // Public shareable audits (/s/<slug>). UNLISTED BY DEFAULT: only audits the owner flagged
  // (analyses.share_indexable — a store's own published/claimed audit) with complete v2 content and an
  // uncaptured-blocked screenshot are listed. The rule lives in lib/analyzer/share-policy.ts and is the same
  // predicate generateMetadata uses for robots, so the sitemap and the page can never disagree.
  // Outreach audits and pre-v2 audits stay reachable by link but are noindex and out of the sitemap.
  let sharedEntries: MetadataRoute.Sitemap = [];
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("analyses")
      .select(
        "share_slug, finished_at, share_indexable, verdict:result->ad_readiness->>verdict, fixes:result->top_fixes, why:result->potential_why, blocked:result->capture_blocked->detected",
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .not("share_slug", "is", null as any)
      .eq("status", "succeeded")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("share_indexable" as any, true as any)
      .order("finished_at", { ascending: false })
      .limit(1000);
    if (Array.isArray(data)) {
      sharedEntries = data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) =>
          row?.share_slug &&
          isShareIndexable({
            share_indexable: row.share_indexable === true,
            ad_readiness_verdict: row.verdict ?? null,
            fix_count: Array.isArray(row.fixes) ? row.fixes.length : 0,
            potential_why: Array.isArray(row.why) ? row.why : null,
            capture_blocked: typeof row.blocked === "boolean" ? row.blocked : null,
            created_at: row.finished_at ?? null,
          }),
        )
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

  return [...staticEntries, ...nicheEntries, ...blogEntries, ...sharedEntries];
}
