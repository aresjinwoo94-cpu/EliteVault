/**
 * v3.7 — backfill composite_score + rank_tier for existing community_analyses.
 *
 * The 0007 migration added the columns with default 0 / null. This script
 * computes the real value for every existing row from its stored score +
 * scenarios JSONB. Run once after applying the migration; idempotent.
 *
 * Usage:
 *   node scripts/backfill-community-ranks.mjs           (dry run, prints)
 *   node scripts/backfill-community-ranks.mjs --write   (actually update)
 *
 * The composite + tier logic is inlined here so the script doesn't
 * depend on the TS module from lib/ranking/tiers.ts (we'd need a
 * separate compile pass otherwise). Keep these two in sync if you change
 * the formula or thresholds.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);
const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const WRITE = process.argv.includes("--write");

// Mirror of lib/ranking/tiers.ts — keep in sync.
const TIER_THRESHOLDS = [
  { key: "sovereign", min: 95 },
  { key: "magnate", min: 88 },
  { key: "titan", min: 80 },
  { key: "mogul", min: 72 },
  { key: "empire", min: 64 },
  { key: "scaler", min: 56 },
  { key: "operator", min: 48 },
  { key: "builder", min: 38 },
  { key: "founder", min: 28 },
  { key: "apprentice", min: 0 },
];

function normalizeScore(raw) {
  const n = typeof raw === "number" && isFinite(raw) ? raw : 0;
  return n > 1 ? n : n * 100;
}

function computeComposite(score, metaAdsGood) {
  const s = normalizeScore(score);
  const m = typeof metaAdsGood === "number" && isFinite(metaAdsGood) ? metaAdsGood : 0;
  const bonus = Math.min(m * 200, 20);
  const composite = Math.max(0, Math.min(100, s + bonus));
  return Math.round(composite * 100) / 100;
}

function tierFor(composite) {
  for (const t of TIER_THRESHOLDS) {
    if (composite >= t.min) return t.key;
  }
  return "apprentice";
}

const { data: rows, error } = await svc
  .from("community_analyses")
  .select("id, slug, score, scenarios, composite_score, rank_tier")
  .eq("is_removed", false);

if (error) {
  console.error("✗ Fetch failed:", error.message);
  process.exit(1);
}
if (!rows || rows.length === 0) {
  console.log("No community_analyses rows to backfill.");
  process.exit(0);
}

console.log(`\nProcessing ${rows.length} community_analyses rows…\n`);

const updates = [];
for (const r of rows) {
  const metaAdsGood = r.scenarios?.meta_ads_good;
  const composite = computeComposite(r.score, metaAdsGood);
  const tier = tierFor(composite);

  const oldComposite = Number(r.composite_score ?? 0);
  const oldTier = r.rank_tier;

  const changed =
    Math.abs(oldComposite - composite) > 0.01 || oldTier !== tier;
  const flag = changed ? "Δ" : "·";
  console.log(
    `  ${flag} ${r.slug.padEnd(40)} score=${normalizeScore(r.score).toFixed(0).padStart(3)} → composite=${composite.toString().padStart(6)} tier=${tier}`,
  );
  if (changed) {
    updates.push({ id: r.id, composite_score: composite, rank_tier: tier });
  }
}

console.log(
  `\n${"─".repeat(60)}\n${updates.length} row(s) need updating (of ${rows.length}).`,
);

if (!WRITE) {
  console.log("Dry run — pass --write to actually update.");
  process.exit(0);
}

if (updates.length === 0) {
  console.log("Nothing to update.");
  process.exit(0);
}

console.log("\nWriting…");
// Update one at a time — count is small and the round-trips are cheap.
// If this scales >1k rows we'd batch via a single UPDATE … FROM (VALUES …).
let ok = 0;
for (const u of updates) {
  const { error: upErr } = await svc
    .from("community_analyses")
    .update({ composite_score: u.composite_score, rank_tier: u.rank_tier })
    .eq("id", u.id);
  if (upErr) {
    console.warn(`  ✗ ${u.id}: ${upErr.message}`);
  } else {
    ok++;
  }
}
console.log(`✓ ${ok}/${updates.length} updated.`);
