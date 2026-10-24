/**
 * WP-L2 — APPLY the plan produced by gate-audit.mts. Dry-run unless `--yes` is passed.
 *
 *   npx tsx --tsconfig scripts/tests/tsconfig.json --conditions=react-server \
 *     scripts/library/gate-apply.mts --env <.env.local> --plan <plan.json> [--yes]
 *
 * Per row it writes: the verification evidence (store_checks / store_checked_at), a re-assigned niche when
 * the home belongs to another niche, and the status + review_reason the gate decided. It:
 *   • never touches the image of a row (owner images stay protected by migration 0040 anyway);
 *   • never PUBLISHES a held row (review_reason = image_pending_review): those wait for the owner's OK;
 *   • skips a row whose status/niche changed since the plan was made (stale plan);
 *   • sets momentum_score = NULL for every row without a MEASURED ad count (estimates must never order
 *     the Library above measured stores); rows move back to a score by themselves when Meta measures them.
 * Requires migration 0041 (store_checks) to be applied first.
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
for (const l of readFileSync(arg("--env", ".env.local"), "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const yes = argv.includes("--yes");
const plans = JSON.parse(readFileSync(arg("--plan", "plan.json"), "utf8")) as {
  id: string;
  domain: string;
  from: { status: string; niche: string; reason: string | null };
  to: { status: string; niche: string; reason: string | null };
  action: string;
  evidence: unknown & { checkedAt: string };
  tier: string;
}[];

const { createSupabaseServiceClient } = await import("../../lib/supabase/server");
const svc = createSupabaseServiceClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sites = svc.from("winning_sites") as any;

const { data: cur, error } = await svc.from("winning_sites").select("id, status, niche, review_reason");
if (error) throw new Error(error.message);
const now = new Map((cur ?? []).map((r) => [r.id as string, r as { status: string; niche: string; review_reason: string | null }]));

let changed = 0;
let skipped = 0;
for (const p of plans) {
  const row = now.get(p.id);
  if (!row || row.status !== p.from.status || row.niche !== p.from.niche) {
    console.log(`  ⚠ skip ${p.domain}: changed since the plan`);
    skipped++;
    continue;
  }
  const held = row.review_reason === "image_pending_review";
  const patch: Record<string, unknown> = {
    store_checks: p.evidence,
    store_checked_at: p.evidence.checkedAt,
  };
  if (p.to.niche !== p.from.niche) patch.niche = p.to.niche;
  // never publish a held row; keep its hold marker
  if (!held) {
    patch.status = p.to.status;
    patch.review_reason = p.to.status === "published" ? null : p.to.reason;
  }
  // Estimated ad counts never rank: only measured rows keep a momentum score.
  if (p.tier !== "measured") patch.momentum_score = null;

  const what = [
    p.to.niche !== p.from.niche ? `niche ${p.from.niche}→${p.to.niche}` : "",
    !held && p.to.status !== p.from.status ? `${p.from.status}→${p.to.status}${p.to.reason ? ` (${p.to.reason})` : ""}` : "",
  ].filter(Boolean).join(" · ");
  if (what) console.log(`  ${yes ? "✎" : "·"} ${p.domain.padEnd(26)} ${what}`);
  if (yes) {
    const { error: e } = await sites.update(patch).eq("id", p.id);
    if (e) {
      console.log(`  ✗ ${p.domain}: ${e.message}`);
      continue;
    }
  }
  changed++;
}
console.log(`\n${yes ? "APPLIED" : "DRY RUN (nothing written)"}: ${changed} row(s), ${skipped} skipped as stale.`);
