/**
 * Library verification + publication job (FASE A.3).
 *
 *   npm run library:verify                 → verify the 100 stalest rows
 *   npm run library:verify -- -n 500       → bigger batch
 *   npm run library:verify -- --all        → every row
 *   npm run library:verify -- --dry        → report only, no writes
 *
 * What it does, per row:
 *   1. normalizes url/domain and fills `domain_key` (dedup key)
 *   2. probes the site (HTTP) → `is_live`, `last_verified_at`
 *   3. fills `favicon_url` when missing
 *   4. runs the publication gate (lib/library/quality.ts) →
 *      `published` when it passes, `review` when it doesn't
 *
 * Idempotent: it only ever updates the row it read, keyed by id, with values
 * derived from the current state of the world. Re-running is a no-op for rows
 * that haven't changed.
 *
 * SAFETY: a row that is currently `published` is never silently unpublished on
 * a single failed probe — it takes two consecutive failures (tracked by
 * `is_live` already being false) to demote it. One flaky timeout must not blank
 * a niche out of the analyzer module.
 */
import {
  serviceClient,
  mapSettled,
  probeLive,
  arg,
  hasFlag,
  requireExpansionColumns,
  exitWith,
} from "./_shared.mts";
import { normalizeDomain, canonicalUrl, faviconUrl } from "../../lib/library/domain.ts";
import { judgeStore } from "../../lib/library/quality.ts";

interface Row {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  niche: string | null;
  thumbnail_url: string | null;
  favicon_url: string | null;
  domain_key: string | null;
  status: string;
  is_live: boolean;
  active_ads_count: number | null;
  internal_score: number | null;
  ad_signals: { active_ads?: number; activity_score?: number } | null;
  metrics: { conv_rate?: number; traffic_est?: number } | null;
}

const svc = serviceClient();
await requireExpansionColumns(svc);

const dry = hasFlag("--dry");
const all = hasFlag("--all");
const limit = Number(arg("-n", "100"));

const query = svc
  .from("winning_sites")
  .select(
    "id, url, domain, title, niche, thumbnail_url, favicon_url, domain_key, status, is_live, active_ads_count, internal_score, ad_signals, metrics",
  )
  // Stalest first, so repeated runs sweep the whole table.
  .order("last_verified_at", { ascending: true, nullsFirst: true });

const { data, error } = all ? await query : await query.limit(limit);
if (error) {
  console.error(`✗ could not read winning_sites: ${error.message}`);
  await exitWith(1);
}
const rows = (data ?? []) as unknown as Row[];
console.log(
  `\nVerifying ${rows.length} store(s)${dry ? " (dry run — no writes)" : ""}…\n`,
);

const seenKeys = new Map<string, string>(); // domain_key → row id
const stats = { published: 0, review: 0, dead: 0, dupes: 0, unchanged: 0 };

const outcome = await mapSettled(
  rows,
  async (row) => {
    const domain = normalizeDomain(row.domain ?? row.url);
    const url = canonicalUrl(row.url ?? row.domain) ?? row.url;

    // Unresolvable rows can't be probed or linked — park them for a human.
    if (!domain) {
      stats.review++;
      if (!dry)
        await svc
          .from("winning_sites")
          .update({ status: "review", last_verified_at: new Date().toISOString() })
          .eq("id", row.id);
      return `  ? ${String(row.domain).padEnd(30)} unresolvable domain → review`;
    }

    // Duplicate detection inside this run (the DB unique index covers the rest).
    const prior = seenKeys.get(domain);
    if (prior && prior !== row.id) {
      stats.dupes++;
      return `  = ${domain.padEnd(30)} duplicate of ${prior} → left for audit`;
    }
    seenKeys.set(domain, row.id);

    const live = await probeLive(url);

    // Never demote a healthy published row on one bad probe (see header note).
    const confirmedDead = !live && row.is_live === false;
    const isLive = live ? true : row.status === "published" && row.is_live ? true : false;

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

    if (!dry) {
      const { error: upErr } = await svc
        .from("winning_sites")
        .update(patch)
        .eq("id", row.id);
      if (upErr) throw new Error(`${domain}: ${upErr.message}`);
    }

    if (!live) stats.dead++;
    if (verdict.status === "published") stats.published++;
    else stats.review++;
    if (verdict.status === row.status) stats.unchanged++;

    const mark = verdict.status === "published" ? "✓" : "·";
    const why = verdict.reasons.length ? ` (${verdict.reasons.join(", ")})` : "";
    return `  ${mark} ${domain.padEnd(30)} ${verdict.status}${why}`;
  },
  { concurrency: 6, delayMs: 500, label: "probing" },
);

outcome.ok.forEach((line) => console.log(line));

if (outcome.failed.length) {
  console.log(`\n${outcome.failed.length} row(s) failed (batch NOT aborted):`);
  outcome.failed.forEach((f) => console.log(`  ✗ ${f.error}`));
}

console.log(
  `\nDone. published=${stats.published} review=${stats.review} ` +
    `offline=${stats.dead} in-run-dupes=${stats.dupes} unchanged=${stats.unchanged}` +
    (dry ? "  (dry run — nothing written)" : ""),
);
