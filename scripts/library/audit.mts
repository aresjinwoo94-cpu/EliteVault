/**
 * Library data-quality audit (FASE A.5 acceptance criteria, as a command).
 *
 *   npm run library:audit
 *
 * Read-only. Never writes. Prints, and exits non-zero when an acceptance
 * criterion fails so it can gate a deploy:
 *
 *   • zero duplicate domains
 *   • zero published rows with an unrenderable field (the module would print
 *     "undefined"/"NaN")
 *   • every published row is live, has a niche and at least one signal
 *   • niche coverage: which niches have the ≥3 published stores the analyzer
 *     module needs, and which are still thin
 */
import { serviceClient, requireExpansionColumns, exitWith } from "./_shared.mts";
import { normalizeDomain } from "../../lib/library/domain.ts";
import { NICHE_LABELS } from "../../lib/library/niches.ts";

interface Row {
  id: string;
  url: string | null;
  domain: string | null;
  domain_key: string | null;
  title: string | null;
  niche: string | null;
  status: string;
  is_live: boolean;
  active_ads_count: number | null;
  internal_score: number | null;
  momentum_score: number | null;
  est_revenue_low: number | null;
  est_revenue_high: number | null;
  last_verified_at: string | null;
}

const svc = serviceClient();
await requireExpansionColumns(svc);

const { data, error } = await svc
  .from("winning_sites")
  .select(
    "id, url, domain, domain_key, title, niche, status, is_live, active_ads_count, internal_score, momentum_score, est_revenue_low, est_revenue_high, last_verified_at",
  );
if (error) {
  console.error(`✗ ${error.message}`);
  await exitWith(1);
}
const rows = (data ?? []) as unknown as Row[];

const by = (s: string) => rows.filter((r) => r.status === s);
const published = by("published");

console.log(`\n── Library audit ──────────────────────────────────────────`);
console.log(`total ${rows.length}   published ${published.length}   review ${by("review").length}   draft ${by("draft").length}`);

let failures = 0;

// ── 1. Duplicates ────────────────────────────────────────────────────────
const seen = new Map<string, string[]>();
for (const r of rows) {
  const key = r.domain_key ?? normalizeDomain(r.domain ?? r.url);
  if (!key) continue;
  seen.set(key, [...(seen.get(key) ?? []), r.id]);
}
const dupes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
if (dupes.length) {
  failures++;
  console.log(`\n✗ ${dupes.length} duplicated domain(s):`);
  dupes.slice(0, 20).forEach(([k, ids]) => console.log(`    ${k} → ${ids.join(", ")}`));
  console.log("  Fix: keep one row per domain, then re-run migration 0017 to");
  console.log("  create winning_sites_domain_key_uidx.");
} else {
  console.log(`\n✓ no duplicate domains`);
}

// ── 2. Unrenderable published rows ───────────────────────────────────────
const badNum = (v: unknown) =>
  v !== null && (typeof v !== "number" || !Number.isFinite(v));
const broken = published.filter(
  (r) =>
    !normalizeDomain(r.domain ?? r.url) ||
    !r.title?.trim() ||
    !r.niche?.trim() ||
    badNum(r.active_ads_count) ||
    badNum(r.momentum_score) ||
    badNum(r.est_revenue_low) ||
    badNum(r.est_revenue_high),
);
if (broken.length) {
  failures++;
  console.log(`\n✗ ${broken.length} published row(s) would render undefined/NaN:`);
  broken.slice(0, 20).forEach((r) => console.log(`    ${r.domain ?? r.id}`));
} else {
  console.log(`✓ every published row renders cleanly`);
}

// ── 3. Publication gate holding ──────────────────────────────────────────
const unfit = published.filter(
  (r) =>
    !r.is_live ||
    !r.niche?.trim() ||
    !(
      (typeof r.active_ads_count === "number" && r.active_ads_count > 0) ||
      (typeof r.internal_score === "number" && r.internal_score > 0)
    ),
);
if (unfit.length) {
  failures++;
  console.log(`\n✗ ${unfit.length} published row(s) fail the publication gate:`);
  unfit.slice(0, 20).forEach((r) =>
    console.log(
      `    ${r.domain ?? r.id} (live=${r.is_live} niche=${r.niche ?? "—"} ads=${r.active_ads_count ?? "—"} score=${r.internal_score ?? "—"})`,
    ),
  );
  console.log("  Fix: npm run library:verify");
} else {
  console.log(`✓ every published row is live, classified and has a signal`);
}

// ── 4. Niche coverage (the module needs ≥3) ──────────────────────────────
const counts = new Map<string, number>();
for (const r of published) {
  if (r.niche) counts.set(r.niche, (counts.get(r.niche) ?? 0) + 1);
}
console.log(`\nNiche coverage (published):`);
const thin: string[] = [];
for (const slug of Object.keys(NICHE_LABELS)) {
  const n = counts.get(slug) ?? 0;
  const mark = n >= 3 ? "✓" : "✗";
  if (n < 3) thin.push(slug);
  console.log(`  ${mark} ${NICHE_LABELS[slug].label.padEnd(16)} ${n}`);
}
const offTaxonomy = [...counts.keys()].filter((k) => !NICHE_LABELS[k]);
if (offTaxonomy.length) {
  console.log(`  ! outside the taxonomy: ${offTaxonomy.join(", ")}`);
}
if (thin.length) {
  failures++;
  console.log(
    `\n✗ ${thin.length} niche(s) below the 3-store minimum: ${thin.join(", ")}` +
      `\n  Fix: npm run library:discover -- ${thin[0]}`,
  );
}

// ── 5. Staleness ─────────────────────────────────────────────────────────
const stale = published.filter(
  (r) =>
    !r.last_verified_at ||
    Date.now() - new Date(r.last_verified_at).getTime() > 30 * 86_400_000,
);
console.log(
  `\n${stale.length ? "!" : "✓"} ${stale.length} published row(s) unverified in the last 30 days` +
    (stale.length ? " → npm run library:verify" : ""),
);

console.log(
  `\n${failures === 0 ? "✓ all acceptance criteria met" : `✗ ${failures} criterion/criteria failing`}\n`,
);
await exitWith(failures === 0 ? 0 : 1);
