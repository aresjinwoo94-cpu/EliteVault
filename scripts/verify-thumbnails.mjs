/**
 * Verifies that the mshots thumbnail for each winning_sites row actually
 * resolves to a real screenshot — not a "generating", Cloudflare
 * challenge, or error placeholder.
 *
 * mshots quirks we filter for:
 *   • size < 8 KB → almost certainly the "verifying / generating" 1.5 KB
 *     gray placeholder
 *   • content-type not image/*
 *   • HTTP not 200
 *
 * Usage:  npm run library:verify   (prints status, no DB writes)
 *         npm run library:verify -- --delete   (deletes dead rows)
 *
 * mshots is lazy — first hit on a URL triggers their capture pipeline
 * and returns a placeholder. We retry up to 3 times with 4s delay.
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

const DELETE = process.argv.includes("--delete");
// Real screenshots from mshots range 50-250 KB. The "verifying / generating"
// gray placeholder is ~1-2 KB. Cloudflare-blocked sites give a low-info
// challenge page around 15-25 KB. 40 KB is the safe floor for "this looks
// like an actual rendered page".
const MIN_BYTES = 40000;

const { data: sites } = await svc
  .from("winning_sites")
  .select("id, domain, url, thumbnail_url, is_preselected")
  .order("domain");

if (!sites || sites.length === 0) {
  console.log("No sites in library.");
  process.exit(0);
}

console.log(`\nVerifying ${sites.length} thumbnails (mshots, can take a minute)…\n`);

const dead = [];
let okCount = 0;

for (const s of sites) {
  let bytes = 0;
  let ok = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(s.thumbnail_url, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        break;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      bytes = buf.length;
      const ctype = res.headers.get("content-type") ?? "";
      if (bytes >= MIN_BYTES && ctype.startsWith("image/")) {
        ok = true;
        break;
      }
      // Probably placeholder — retry
      if (attempt < 3) await new Promise((r) => setTimeout(r, 4000));
    } catch (err) {
      // Network/timeout — retry
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const flag = ok ? "✓" : "✗";
  const pre = s.is_preselected ? "★" : " ";
  console.log(`  ${flag} ${pre} ${s.domain.padEnd(30)} ${(bytes / 1024).toFixed(1)} KB`);
  if (ok) okCount++;
  else dead.push(s);
}

console.log(`\n${"─".repeat(60)}`);
console.log(`OK: ${okCount}    Dead: ${dead.length}`);

if (DELETE && dead.length > 0) {
  console.log(`\nDeleting ${dead.length} dead rows…`);
  const ids = dead.map((d) => d.id);
  const { error } = await svc.from("winning_sites").delete().in("id", ids);
  if (error) console.error("✗ Delete failed:", error.message);
  else console.log("✓ Cleaned up.");
} else if (dead.length > 0) {
  console.log("\nRun with `--delete` to remove dead rows.");
}
