import "server-only";
import type { createSupabaseServiceClient } from "@/lib/supabase/server";
import { urlHash } from "@/lib/image-hash";
import type { DiscoverySummary } from "@/lib/site-discovery";

/**
 * WP-1 — discovery cache keyed by URL hash.
 *
 * `discoverSite()` fetches the store's HTML and regex-parses it. It's capped at
 * a 10s fetch, and today it runs on EVERY audit even when the same store was
 * audited minutes ago. It currently sits in a Promise.all with the screenshot
 * capture, so it only costs wall-clock when it's the slower of the two — but
 * that's exactly what happens on the fast path (a screenshot cache hit, or a
 * ScreenshotOne hit at ~2s against a slow store fetch), which is precisely the
 * re-audit case this removes.
 *
 * Deliberately the same shape as lib/screenshot-cache.ts: same `urlHash` key,
 * same service-role-only access, same "any failure returns null / does nothing"
 * contract. A cache that can fail an audit is worse than no cache, so every
 * path here swallows its errors — including the table not existing yet, which
 * is the state of any database that hasn't had migration 0031 applied.
 *
 * TTL is short by default because store pages change: a stale price band or a
 * missing new trust badge would feed the model a slightly wrong picture of a
 * store the user just edited. 3 hours covers the "audit, tweak, re-audit"
 * session without outliving a real redesign; tune with
 * DISCOVERY_CACHE_TTL_MINUTES, or set it to 0 to disable the cache entirely.
 */

type Service = ReturnType<typeof createSupabaseServiceClient>;

export function discoveryCacheTtlMs(): number {
  const raw = Number(process.env.DISCOVERY_CACHE_TTL_MINUTES);
  const minutes = Number.isFinite(raw) && raw >= 0 ? raw : 180;
  return minutes * 60_000;
}

export async function readDiscoveryCache(
  service: Service,
  url: string,
): Promise<DiscoverySummary | null> {
  const ttlMs = discoveryCacheTtlMs();
  if (ttlMs <= 0) return null;
  try {
    const freshAfter = new Date(Date.now() - ttlMs).toISOString();
    const { data } = await (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.from("discovery_cache") as any
    )
      .select("payload")
      .eq("url_hash", urlHash(url))
      // Freshness is enforced in the QUERY, not after the read: an expired row
      // must not come back at all, so there's no path where a stale payload is
      // used by mistake.
      .gte("updated_at", freshAfter)
      .maybeSingle();
    const payload = data?.payload;
    // Guard the shape as well as the presence. The row is jsonb written by us,
    // but a truncated/legacy payload reaching the analyzer prompt as `undefined`
    // fields would be a silent quality regression, so we insist on the one
    // field every consumer indexes into.
    if (!payload || !Array.isArray(payload.pageUrls)) return null;
    return payload as DiscoverySummary;
  } catch {
    return null;
  }
}

export async function writeDiscoveryCache(
  service: Service,
  url: string,
  payload: DiscoverySummary,
): Promise<void> {
  if (discoveryCacheTtlMs() <= 0) return;
  try {
    await (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.from("discovery_cache") as any
    ).upsert(
      {
        url_hash: urlHash(url),
        url,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url_hash" },
    );
  } catch {
    /* cache write is best-effort — never fail the audit over it */
  }
}
