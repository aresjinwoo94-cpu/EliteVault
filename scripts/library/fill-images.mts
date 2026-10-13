/**
 * Run the Library image job by hand, from THIS machine (not Vercel) — same code as the
 * Inngest function `fill-library-images` (lib/library/images.ts).
 *
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *     scripts/library/fill-images.mts --env <path-to-.env.local> [--limit 12] [--dry-run]
 *
 * Only the store's own og:image is fetched (no Analyzer provider is touched). Owner images
 * are never selected. Writes to winning_sites + Storage unless --dry-run.
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
for (const l of readFileSync(arg("--env", ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const limit = Number(arg("--limit", "12"));
const dry = argv.includes("--dry-run");
// --hold: save the image but DON'T publish; the row is marked image_pending_review until a human
// has looked at the pictures. --promote-held: publish the held rows that pass the gate.
const hold = argv.includes("--hold");
const promote = argv.includes("--promote-held");
const { pickMissingImageRows, fillOneImage } = await import("../../lib/library/images");

if (promote) {
  const { createSupabaseServiceClient } = await import("../../lib/supabase/server");
  const svc = createSupabaseServiceClient();
  const { data } = await svc.from("winning_sites").select("id, domain").eq("review_reason", "image_pending_review");
  for (const r of (data ?? []) as { id: string; domain: string }[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("winning_sites") as any).update({ status: "published", review_reason: null }).eq("id", r.id);
    console.log(`  ${error ? "✗" : "✓"} ${r.domain} ${error ? error.message : "published"}`);
  }
  process.exit(0);
}
const rows = await pickMissingImageRows(limit);
console.log(`${rows.length} store(s) to try${dry ? " (dry run)" : ""}`);
for (const r of rows) {
  if (dry) {
    console.log(`  · ${r.status.padEnd(9)} ${r.domain}`);
    continue;
  }
  const o = await fillOneImage(r, { hold });
  console.log(`  ${o.ok ? "✓" : "✗"} ${r.domain.padEnd(26)} ${o.ok ? `${o.source}${o.published ? " → republished" : ""}` : o.note}`);
  await new Promise((res) => setTimeout(res, 4000));
}
