import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Teardown } from "@/lib/supabase/types";
import { parseNicheWinners, pickCompetitor, type StoredWinner } from "@/lib/analyzer/fix-tracks";
import { NICHE_LABELS } from "@/lib/library/niches";
import { normalizeDomain, faviconUrl } from "@/lib/library/domain";

/**
 * The `competitor` track's data source, shared by the route (to generate) and by
 * the report pages (to decide whether the button is enabled at all).
 *
 * Order of preference, always SAME-niche (never a global/other-niche store):
 *   1. one of the audit's own stored winners (niche_winners, exact match) that has a teardown;
 *   2. otherwise the best teardown-holding store of the audit's detected niche in the Library.
 * Step 2 matters because the stored winners are a rotating window of only 3 stores out of
 * a niche's ~7, while teardowns are written for one store per niche — without it most
 * audits would see "coming soon" although the niche HAS a breakdown.
 *
 * "none"  = the niche has no store holding a teardown → honest empty state, the button
 *           renders disabled ("Coming soon for your niche").
 * "error" = the lookup itself failed → NOT the same as "none": callers must not
 *           treat a DB blip as an empty niche (the route answers 503; the page
 *           keeps the button enabled so nothing is hidden by a transient error).
 */
export type CompetitorResolution =
  | { ok: true; winner: StoredWinner; teardown: Teardown }
  | { ok: false; reason: "none" | "error" };

export async function resolveCompetitor(
  storedNicheWinners: unknown,
  ownUrl?: string | null,
): Promise<CompetitorResolution> {
  // Never throws: the report pages await this, and a missing env / rejected fetch must
  // degrade to "error" (button stays enabled), not take the whole report down.
  try {
    return await resolve(storedNicheWinners, ownUrl ?? null);
  } catch {
    return { ok: false, reason: "error" };
  }
}

type SiteRow = {
  domain: string;
  title?: string | null;
  url?: string | null;
  favicon_url?: string | null;
  active_ads_count?: number | null;
  est_revenue_low?: number | null;
  est_revenue_high?: number | null;
  teardown: Teardown | null;
};

const hasTeardown = (t: Teardown | null | undefined): t is Teardown => !!t?.elements?.length;

async function resolve(storedNicheWinners: unknown, ownUrl: string | null): Promise<CompetitorResolution> {
  const svc = createSupabaseServiceClient();
  const own = normalizeDomain(ownUrl);

  // 1) the audit's own stored winners
  const winners = parseNicheWinners(storedNicheWinners).filter((w) => w.exactMatch && normalizeDomain(w.domain) !== own);
  if (winners.length > 0) {
    const { data, error } = await svc
      .from("winning_sites")
      .select("domain, teardown")
      .in("domain", winners.map((w) => w.domain))
      .eq("status", "published")
      .not("teardown", "is", null);
    if (error) return { ok: false, reason: "error" };
    const teardowns = new Map<string, Teardown>();
    for (const r of (data ?? []) as unknown as SiteRow[]) if (hasTeardown(r.teardown)) teardowns.set(r.domain, r.teardown);
    const pick = pickCompetitor(winners, teardowns);
    if (pick) return { ok: true, winner: pick.winner, teardown: pick.teardown };
  }

  // 2) the niche's best teardown in the Library (only for a real, classified niche)
  const stored = storedNicheWinners as { scope?: unknown; niche?: unknown } | null;
  const niche = typeof stored?.niche === "string" ? stored.niche : "";
  if (!stored || stored.scope === "global" || !NICHE_LABELS[niche]) return { ok: false, reason: "none" };

  const { data, error } = await svc
    .from("winning_sites")
    .select("domain, title, url, favicon_url, active_ads_count, est_revenue_low, est_revenue_high, teardown")
    .eq("niche", niche)
    .eq("status", "published")
    .eq("is_live", true)
    .not("teardown", "is", null)
    .order("momentum_score", { ascending: false, nullsFirst: false })
    .limit(10);
  if (error) return { ok: false, reason: "error" };

  const rows = ((data ?? []) as unknown as SiteRow[]).filter((r) => hasTeardown(r.teardown) && normalizeDomain(r.domain) !== own);
  const candidates: StoredWinner[] = rows.map((r) => ({
    title: r.title?.trim() || r.domain,
    domain: r.domain,
    url: r.url && /^https?:\/\//i.test(r.url) ? r.url : `https://${r.domain}`,
    faviconUrl: r.favicon_url || faviconUrl(r.domain),
    exactMatch: true,
    activeAds: typeof r.active_ads_count === "number" ? r.active_ads_count : null,
    revenue:
      typeof r.est_revenue_low === "number" && typeof r.est_revenue_high === "number"
        ? { low: r.est_revenue_low, high: r.est_revenue_high }
        : null,
  }));
  const teardowns = new Map<string, Teardown>(rows.map((r) => [r.domain, r.teardown as Teardown]));
  const pick = pickCompetitor(candidates, teardowns);
  return pick ? { ok: true, winner: pick.winner, teardown: pick.teardown } : { ok: false, reason: "none" };
}
