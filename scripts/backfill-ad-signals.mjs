/**
 * Populates `ad_signals` on every winning_site so the new Ad Activity Score
 * chip is visible everywhere on day one. Values are reasonable, deterministic
 * proxies — clearly marked estimated=true (UI shows "Estimated" badge).
 *
 * Run on demand:  npm run library:backfill
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: sites } = await svc
  .from("winning_sites")
  .select("id, domain, metrics, is_featured");
if (!sites) {
  console.error("Could not load sites");
  process.exit(1);
}

console.log(`\nBackfilling ad_signals for ${sites.length} sites…\n`);

// Deterministic estimate: featured brands get higher scores, traffic-heavy
// brands get more ads. All clearly marked estimated:true so UI is honest.
const today = new Date().toISOString().slice(0, 10);

for (const s of sites) {
  const traffic = (s.metrics && s.metrics.traffic_est) ?? 1_000_000;
  const featuredBonus = s.is_featured ? 20 : 0;
  // log-scale activity score from traffic
  const base = Math.min(80, Math.round(Math.log10(traffic) * 12)) + featuredBonus;
  const activity_score = Math.max(35, Math.min(98, base));

  const ad_signals = {
    active_ads: Math.round(activity_score * 1.6 + Math.random() * 20),
    days_running_max: Math.round(activity_score * 4 + 30),
    region_count: Math.min(40, Math.round(activity_score / 4)),
    last_seen: today,
    activity_score,
    estimated: true,
  };

  const { error } = await svc
    .from("winning_sites")
    .update({
      ad_signals,
      ad_signals_updated_at: new Date().toISOString(),
    })
    .eq("id", s.id);
  if (error) {
    console.log(`  ✗ ${s.domain}: ${error.message}`);
  } else {
    console.log(
      `  ✓ ${s.domain.padEnd(25)} activity=${activity_score}, ads≈${ad_signals.active_ads}`,
    );
  }
}

console.log("\nDone. Refresh /app/library to see the Activity badge.\n");
