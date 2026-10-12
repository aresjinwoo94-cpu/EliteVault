/**
 * Library expansion CLI.
 *
 * Usage:
 *   npm run library:expand -- skincare
 *   npm run library:expand -- "pet supplies" -n 12
 *
 * Calls the library-discovery-agent, then upserts the candidates into
 * `winning_sites` (idempotent on `url`). Uses a generic Unsplash thumbnail
 * if no real screenshot can be captured — to be replaced later by an
 * Inngest job that does proper captures.
 */
// Offline job: must use GEMINI_API_KEY_JOBS, never the production key (scripts/lib/jobs-key.mjs).
import "./lib/require-jobs-key.mjs";
import { readFileSync } from "node:fs";
import { stripMeasurementProof } from "../lib/library/ad-signal";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const [k, v] of Object.entries(env)) process.env[k] = v;

const niche = process.argv[2];
if (!niche) {
  console.error("usage: tsx scripts/expand-library.ts <niche> [-n count]");
  process.exit(1);
}
const nIdx = process.argv.indexOf("-n");
const desiredCount =
  nIdx > -1 && process.argv[nIdx + 1] ? Number(process.argv[nIdx + 1]) : 10;

const { runLibraryDiscoveryAgent } = await import(
  "../ai/agents/library-discovery-agent"
);
const { createClient } = await import("@supabase/supabase-js");

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

console.log(`\nDiscovering ${desiredCount} stores in "${niche}"…\n`);

const { data: existing } = await svc
  .from("winning_sites")
  .select("domain")
  .eq("niche", niche);
const exclude = (existing ?? []).map((r) => r.domain);

const result = await runLibraryDiscoveryAgent({
  niche,
  exclude,
  desiredCount,
});

console.log(`Got ${result.candidates.length} candidates.\n`);

let added = 0;
let skipped = 0;
for (const c of result.candidates) {
  const row = {
    url: c.url,
    domain: c.domain,
    title: c.title,
    description: c.description,
    niche: c.niche || niche,
    // No placeholder image (brief oct-2026 §L.3): a live mshots URL here is what
    // published 28 letter-tile stores. The row enters as a draft WITHOUT an
    // image; the low-priority image job (inngest/functions/fill-library-images.ts)
    // gets a real one and only then can it be published.
    thumbnail_url: null,
    status: "draft",
    review_reason: "no_image",
    metrics: c.metrics,
    tags: c.tags,
    // An AI seed can never carry the proof of a Meta measurement (lib/library/ad-signal.ts).
    ad_signals: stripMeasurementProof(c.ad_signals as Record<string, unknown> | null),
    ad_signals_updated_at: new Date().toISOString(),
    added_by_ai: true,
  };
  const { error } = await svc
    .from("winning_sites")
    .upsert(row, { onConflict: "url", ignoreDuplicates: true });
  if (error) {
    console.error(`  ✗ ${c.domain}: ${error.message}`);
    skipped++;
  } else {
    console.log(
      `  + ${c.domain.padEnd(30)} activity=${c.ad_signals.activity_score}`,
    );
    added++;
  }
}

if (result.caveats.length) {
  console.log("\nAgent caveats:");
  result.caveats.forEach((c) => console.log(`  · ${c}`));
}

console.log(`\nDone. ${added} added/updated, ${skipped} skipped.`);
if (added > 0) {
  console.log(
    "\nNext: nothing to run — the image job (every few hours) fetches a real\n" +
      "image for each new draft; stores without one stay unpublished and appear\n" +
      "in the owner monitor's \"Sin imagen\" list.",
  );
}
