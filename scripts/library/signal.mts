/**
 * Signal backfill for stores waiting in `review` (owner decision 2026-10-09).
 *
 *   npm run library:signal            → fill ad signals for live `review` rows that lack one
 *   npm run library:signal -- --dry   → report only
 *
 * Why this exists: the publication gate (lib/library/quality.ts) needs at least ONE
 * signal — active ads or an internal score. `momentum` is the job that fetches ad
 * counts, but it only walks rows that are already `published`, so a store parked in
 * `review` for "no signal" could never get one and stayed parked forever.
 *
 * It does exactly what `momentum` does for one row — `countActiveAds(title || domain)`
 * against the Meta Ad Library — and writes ONLY `active_ads_count`, `ads_last_checked_at` and the
 * measurement proof (`ad_signals.source/measured_at`) when the API answers with a positive number. It never touches `status`: promoting is
 * `library:verify`'s job (run it after this one), so a row only publishes if it passes
 * the same gate as every other store.
 *
 * A null answer (no token, API error, no coverage) writes nothing: "can't tell" is not
 * a signal, and the row stays in review.
 */
import {
  serviceClient,
  mapSettled,
  hasFlag,
  requireExpansionColumns,
  exitWith,
} from "./_shared.mts";
import { countActiveAds, metaApiConfigured } from "../../lib/library/meta-ad-library.ts";
import { withMeasurement } from "../../lib/library/ad-signal.ts";

interface Row {
  id: string;
  domain: string;
  title: string | null;
  niche: string | null;
  status: string;
  is_live: boolean;
  active_ads_count: number | null;
  internal_score: number | null;
  ad_signals: Record<string, unknown> | null;
}

const svc = serviceClient();
await requireExpansionColumns(svc);
const dry = hasFlag("--dry");

if (!metaApiConfigured()) {
  console.error("✗ META_AD_LIBRARY_TOKEN is not set — nothing to do.");
  await exitWith(1);
}

const { data, error } = await svc
  .from("winning_sites")
  .select("id, domain, title, niche, status, is_live, active_ads_count, internal_score, ad_signals")
  .eq("status", "review")
  .eq("is_live", true);
if (error) {
  console.error(`✗ could not read winning_sites: ${error.message}`);
  await exitWith(1);
}

const rows = ((data ?? []) as unknown as Row[]).filter(
  (r) => !(r.active_ads_count && r.active_ads_count > 0) && !(r.internal_score && r.internal_score > 0),
);
console.log(`\nBackfilling ad signals for ${rows.length} live review store(s)${dry ? " (dry run)" : ""}…\n`);

let filled = 0;
const out = await mapSettled(
  rows,
  async (row) => {
    const { activeAds } = await countActiveAds(row.title || row.domain);
    if (activeAds === null || activeAds <= 0) {
      return `  · ${row.domain.padEnd(28)} no usable signal (${activeAds === null ? "no data" : "0 active ads"})`;
    }
    filled++;
    const now = new Date().toISOString();
    if (!dry) {
      const { error: upErr } = await svc
        .from("winning_sites")
        .update({ active_ads_count: activeAds, ads_last_checked_at: now, ad_signals: withMeasurement(row.ad_signals, activeAds, now) })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
    }
    return `  ✓ ${row.domain.padEnd(28)} ${activeAds} active ads`;
  },
  { concurrency: 1, delayMs: 800 },
);

console.log(out.ok.join("\n"));
for (const f of out.failed) console.log(`  ✗ ${(f.input as Row).domain}: ${f.error}`);
console.log(`\nDone. signals filled=${filled}/${rows.length}${dry ? "  (dry run — nothing written)" : ""}\n`);
await exitWith(out.failed.length ? 1 : 0);
