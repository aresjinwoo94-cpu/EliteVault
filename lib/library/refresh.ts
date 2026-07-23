import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeDomain, canonicalUrl, faviconUrl } from "@/lib/library/domain";
import { judgeStore, momentumScore, estRevenueRange } from "@/lib/library/quality";
import { countActiveAds, metaApiConfigured } from "@/lib/library/meta-ad-library";

/**
 * Server-side batch refresh for the Library — the SAME work the CLI jobs in
 * scripts/library/ do (verify + momentum), but callable from the Inngest
 * scheduled function so it can run on a cron without a human at a terminal.
 *
 * Why a second implementation instead of importing the .mts CLIs: those are
 * standalone tsx processes (they read .env.local, parse argv, call
 * process.exit). This module shares the exact same PURE decision logic —
 * normalizeDomain, judgeStore, momentumScore, estRevenueRange, countActiveAds
 * — so the two paths can never disagree on WHAT makes a store publishable or
 * how momentum is scored. Only the orchestration (which rows, how many) lives
 * here, and it's deliberately small.
 *
 * Everything is chunked and idempotent. Each call processes the N *stalest*
 * rows and stamps them, so repeated calls sweep the whole table over time
 * without ever reprocessing the same rows back-to-back. The Inngest function
 * runs several chunks per step, each step a fresh <60s invocation.
 */

/**
 * Patch one winning_sites row.
 *
 * The hand-written Supabase types don't carry the 0017 columns, so a typed
 * `.update()` collapses to `never` — the same limitation the analyzer page
 * works around. One casted helper keeps that escape in a single place instead
 * of scattered across every call site.
 */
async function updateSite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await svc.from("winning_sites").update(patch).eq("id", id);
}

/** Liveness probe — HEAD then GET (many stores 405 a HEAD). Never throws. */
async function probeLive(url: string, timeoutMs = 10_000): Promise<boolean> {
  for (const method of ["HEAD", "GET"] as const) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; EliteVaultBot/1.0; +https://elitevaultapp.com)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (res.status < 400) return true;
      if (method === "GET") return false;
    } catch {
      if (method === "GET") return false;
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

interface VerifyRow {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  niche: string | null;
  thumbnail_url: string | null;
  favicon_url: string | null;
  status: string;
  is_live: boolean;
  active_ads_count: number | null;
  internal_score: number | null;
  ad_signals: { active_ads?: number; activity_score?: number } | null;
}

export interface VerifyResult {
  processed: number;
  published: number;
  review: number;
  offline: number;
}

/**
 * Verify the `limit` stalest rows: probe liveness, fill domain_key/favicon,
 * run the publication gate. A currently-published row needs two consecutive
 * failed probes before it's demoted, so one flaky timeout can't blank a niche.
 */
export async function verifyBatch(limit = 25): Promise<VerifyResult> {
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("winning_sites")
    .select(
      "id, url, domain, title, niche, thumbnail_url, favicon_url, status, is_live, active_ads_count, internal_score, ad_signals",
    )
    .order("last_verified_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`verifyBatch read: ${error.message}`);

  const rows = (data ?? []) as unknown as VerifyRow[];
  const result: VerifyResult = { processed: 0, published: 0, review: 0, offline: 0 };

  await Promise.allSettled(
    rows.map(async (row) => {
      const domain = normalizeDomain(row.domain ?? row.url);
      const url = canonicalUrl(row.url ?? row.domain) ?? row.url;

      if (!domain) {
        await updateSite(svc, row.id, {
          status: "review",
          last_verified_at: new Date().toISOString(),
        });
        result.processed++;
        result.review++;
        return;
      }

      const live = await probeLive(url);
      if (!live) result.offline++;
      // Never demote a healthy published row on a single failed probe.
      const isLive = live || (row.status === "published" && row.is_live);
      const confirmedDead = !live && row.is_live === false;

      const activeAds =
        typeof row.active_ads_count === "number"
          ? row.active_ads_count
          : typeof row.ad_signals?.active_ads === "number"
            ? row.ad_signals.active_ads
            : null;
      const internal =
        typeof row.internal_score === "number"
          ? row.internal_score
          : typeof row.ad_signals?.activity_score === "number"
            ? row.ad_signals.activity_score
            : null;

      const verdict = judgeStore({
        url,
        domain,
        title: row.title,
        niche: row.niche,
        isLive: isLive && !confirmedDead,
        hasImage: Boolean(row.thumbnail_url || row.favicon_url || domain),
        activeAdsCount: activeAds,
        internalScore: internal,
      });

      const patch: Record<string, unknown> = {
        domain_key: domain,
        is_live: isLive && !confirmedDead,
        last_verified_at: new Date().toISOString(),
        status: verdict.status,
      };
      if (!row.favicon_url) patch.favicon_url = faviconUrl(domain);
      if (activeAds !== null && row.active_ads_count === null)
        patch.active_ads_count = activeAds;
      if (internal !== null && row.internal_score === null)
        patch.internal_score = internal;

      await updateSite(svc, row.id, patch);
      result.processed++;
      if (verdict.status === "published") result.published++;
      else result.review++;
    }),
  );

  return result;
}

interface MomentumRow {
  id: string;
  domain: string;
  title: string | null;
  niche: string | null;
  metrics: { conv_rate?: number; traffic_est?: number } | null;
  ad_signals: { active_ads?: number } | null;
  active_ads_count: number | null;
  ads_last_checked_at: string | null;
}

export interface MomentumResult {
  processed: number;
  metaHits: number;
}

/**
 * Refresh momentum for the `limit` stalest PUBLISHED rows: pull a fresh Meta
 * active-ad count when a token is configured, recompute the revenue range and
 * momentum score, and stamp them. A count we can't read keeps its last value
 * (never overwritten with 0).
 */
export async function momentumBatch(limit = 20): Promise<MomentumResult> {
  const svc = createSupabaseServiceClient();
  const useMeta = metaApiConfigured();

  const { data, error } = await svc
    .from("winning_sites")
    .select(
      "id, domain, title, niche, metrics, ad_signals, active_ads_count, ads_last_checked_at",
    )
    .eq("status", "published")
    .order("ads_last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`momentumBatch read: ${error.message}`);

  const rows = (data ?? []) as unknown as MomentumRow[];
  const result: MomentumResult = { processed: 0, metaHits: 0 };

  // Meta is rate-limited, so ad-count lookups run SERIALLY. The rest is cheap.
  for (const row of rows) {
    try {
      const now = new Date().toISOString();
      let activeAds =
        typeof row.active_ads_count === "number"
          ? row.active_ads_count
          : typeof row.ad_signals?.active_ads === "number"
            ? row.ad_signals.active_ads
            : null;
      let adsCheckedAt = row.ads_last_checked_at;

      if (useMeta) {
        const { activeAds: fresh } = await countActiveAds(row.title || row.domain);
        if (fresh !== null) {
          activeAds = fresh;
          adsCheckedAt = now;
          result.metaHits++;
        }
      }

      const conv =
        typeof row.metrics?.conv_rate === "number" ? row.metrics.conv_rate : null;
      const traffic =
        typeof row.metrics?.traffic_est === "number" ? row.metrics.traffic_est : null;
      const revenue = estRevenueRange(row.niche, conv, traffic);
      const momentum = momentumScore({
        activeAdsCount: activeAds,
        convRate: conv,
        trafficEst: traffic,
        adsCheckedAt,
      });

      await updateSite(svc, row.id, {
        active_ads_count: activeAds,
        ads_last_checked_at: adsCheckedAt ?? now,
        est_conv_rate: conv,
        est_revenue_low: revenue?.low ?? null,
        est_revenue_high: revenue?.high ?? null,
        momentum_score: momentum,
      });
      result.processed++;
    } catch {
      // One bad row never aborts the batch (matches the CLI's guarantee).
    }
  }

  return result;
}
