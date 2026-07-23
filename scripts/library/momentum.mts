/**
 * Momentum + revenue refresh job (FASE A.4).
 *
 *   npm run library:momentum                → refresh the 100 stalest published rows
 *   npm run library:momentum -- -n 400
 *   npm run library:momentum -- --all
 *   npm run library:momentum -- --dry
 *
 * For every `published` store it refreshes, in this order:
 *   1. `active_ads_count` + `ads_last_checked_at` from the Meta Ad Library
 *      Graph API — WHEN a token is configured and the API answers. Otherwise
 *      the existing count is kept (never zeroed) and we carry on.
 *   2. `est_conv_rate` from the stored metrics.
 *   3. `est_revenue_low` / `est_revenue_high` — modeled range, always "est.".
 *   4. `momentum_score` — the single column the analyzer module sorts on.
 *
 * This is the ONLY place that talks to Meta. The user request path reads the
 * columns this job writes and nothing else, which is what keeps the analyzer
 * free of per-request third-party calls.
 */
import {
  serviceClient,
  mapSettled,
  arg,
  hasFlag,
  requireExpansionColumns,
  exitWith,
} from "./_shared.mts";
import { countActiveAds, metaApiConfigured } from "../../lib/library/meta-ad-library.ts";
import { momentumScore, estRevenueRange } from "../../lib/library/quality.ts";

interface Row {
  id: string;
  domain: string;
  title: string | null;
  niche: string | null;
  metrics: { conv_rate?: number; traffic_est?: number } | null;
  ad_signals: { active_ads?: number } | null;
  active_ads_count: number | null;
  ads_last_checked_at: string | null;
}

const svc = serviceClient();
await requireExpansionColumns(svc);

const dry = hasFlag("--dry");
const all = hasFlag("--all");
const limit = Number(arg("-n", "100"));
const useMeta = metaApiConfigured() && !hasFlag("--no-meta");

if (!useMeta) {
  console.log(
    "\nℹ META_AD_LIBRARY_TOKEN not set (or --no-meta) — ad counts are left as they\n" +
      "  are and momentum is recomputed from the stored signals only.",
  );
}

const query = svc
  .from("winning_sites")
  .select(
    "id, domain, title, niche, metrics, ad_signals, active_ads_count, ads_last_checked_at",
  )
  .eq("status", "published")
  .order("ads_last_checked_at", { ascending: true, nullsFirst: true });

const { data, error } = all ? await query : await query.limit(limit);
if (error) {
  console.error(`✗ could not read winning_sites: ${error.message}`);
  await exitWith(1);
}
const rows = (data ?? []) as unknown as Row[];
console.log(
  `\nRefreshing momentum for ${rows.length} published store(s)${dry ? " (dry run)" : ""}…\n`,
);

let metaHits = 0;

const outcome = await mapSettled(
  rows,
  async (row) => {
    const now = new Date().toISOString();

    // 1 — ad count. Null result = "we couldn't tell", so KEEP the last known
    // value rather than writing 0 (a 0 would read as "they stopped spending").
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
        metaHits++;
      }
    }

    // 2/3 — conversion + modeled revenue range from public signals.
    const conv =
      typeof row.metrics?.conv_rate === "number" ? row.metrics.conv_rate : null;
    const traffic =
      typeof row.metrics?.traffic_est === "number" ? row.metrics.traffic_est : null;
    const revenue = estRevenueRange(row.niche, conv, traffic);

    // 4 — the sort key.
    const momentum = momentumScore({
      activeAdsCount: activeAds,
      convRate: conv,
      trafficEst: traffic,
      adsCheckedAt,
    });

    const patch: Record<string, unknown> = {
      active_ads_count: activeAds,
      ads_last_checked_at: adsCheckedAt ?? now,
      est_conv_rate: conv,
      est_revenue_low: revenue?.low ?? null,
      est_revenue_high: revenue?.high ?? null,
      momentum_score: momentum,
    };

    if (!dry) {
      const { error: upErr } = await svc
        .from("winning_sites")
        .update(patch)
        .eq("id", row.id);
      if (upErr) throw new Error(`${row.domain}: ${upErr.message}`);
    }

    return `  ✓ ${row.domain.padEnd(30)} ads=${activeAds ?? "—"} momentum=${momentum ?? "—"}` +
      (revenue ? ` rev≈$${Math.round(revenue.low / 1000)}k–${Math.round(revenue.high / 1000)}k/mo est.` : "");
  },
  // Meta's Graph API is rate limited — go slow when we're actually calling it.
  { concurrency: useMeta ? 3 : 10, delayMs: useMeta ? 1200 : 200, label: "refreshing" },
);

outcome.ok.forEach((line) => console.log(line));

if (outcome.failed.length) {
  console.log(`\n${outcome.failed.length} row(s) failed (batch NOT aborted):`);
  outcome.failed.forEach((f) => console.log(`  ✗ ${f.error}`));
}

console.log(
  `\nDone. ${outcome.ok.length} refreshed, ${outcome.failed.length} failed` +
    (useMeta ? `, ${metaHits} fresh Meta count(s)` : "") +
    (dry ? "  (dry run — nothing written)" : ""),
);
