/**
 * Analyzer latency report (docs/analyzer-speed-fix-free-tier.md §5.3).
 *
 * Usage:
 *   node scripts/analyzer-latency-report.mjs                 last 14 days
 *   node scripts/analyzer-latency-report.mjs --since 2026-10-02
 *   node scripts/analyzer-latency-report.mjs --last 10       acceptance check on the 10 most recent
 *
 * Read-only. Reads `analyses` (+ `usage_events` for the model when the audit
 * predates analyses.timings) with the service role from .env.local.
 *
 * # What the numbers mean
 *   time   = finished_at - created_at: what the USER waited, queue included —
 *            the same definition as the table in §1 of the brief.
 *   OK     = status 'succeeded'. Refund = 'refunded' or 'failed'.
 *   p50/p90 are over SUCCEEDED audits (a refund has no meaningful "time").
 *   model  = analyses.timings.model (0034+), else the model of the audit's
 *            'analysis' usage_events row, else "?" (audits from the stale
 *            pipeline were metered as 'other' without an analysisId).
 *   Days are bucketed in America/Guayaquil (UTC-5), like the brief.
 *
 * Acceptance (§7.4): on ≥10 real audits, p50 ≤ 40s, p90 ≤ 60s, refunds ≤ 1/10.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(process.env.ENV_FILE ?? ".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i < 1 || line.startsWith("#")) continue;
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const TZ_OFFSET_MS = -5 * 3600_000; // America/Guayaquil, no DST
const since = arg("--since")
  ? new Date(`${arg("--since")}T00:00:00-05:00`)
  : new Date(Date.now() - 14 * 86400_000);
const last = arg("--last") ? Number(arg("--last")) : null;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Paged: a busy fortnight can exceed one PostgREST page.
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

let analyses;
try {
  analyses = await all(() =>
    sb
      .from("analyses")
      .select("id,status,created_at,started_at,finished_at,timings")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }),
  );
} catch (err) {
  // Before migration 0034 the column doesn't exist; report without it.
  if (!/timings/.test(String(err.message))) throw err;
  analyses = await all(() =>
    sb
      .from("analyses")
      .select("id,status,created_at,started_at,finished_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }),
  );
}
analyses = analyses.filter((a) => ["succeeded", "refunded", "failed"].includes(a.status));
if (last) analyses = analyses.slice(0, last);

const usage = await all(() =>
  sb
    .from("usage_events")
    .select("created_at,event_type,model,meta")
    .eq("event_type", "analysis")
    .gte("created_at", since.toISOString()),
);
const modelByAnalysis = new Map();
for (const u of usage) {
  const id = u.meta?.analysisId;
  // The vision call is the one with the biggest prompt; any row will do for
  // the model, but prefer the one the provider marked with its latency.
  if (id && (!modelByAnalysis.has(id) || u.meta?.latencyMs)) {
    modelByAnalysis.set(id, u.meta?.model ?? u.model);
  }
}

const secs = (a) =>
  a.finished_at && a.created_at
    ? (Date.parse(a.finished_at) - Date.parse(a.created_at)) / 1000
    : null;
const pct = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
};
const fmt = (v) => (v == null ? "—" : `${Math.round(v)} s`);
const day = (iso) => new Date(Date.parse(iso) + TZ_OFFSET_MS).toISOString().slice(0, 10);
const modelOf = (a) => a.timings?.model ?? modelByAnalysis.get(a.id) ?? "?";

function table(title, keyOf) {
  const groups = new Map();
  for (const a of analyses) {
    const k = keyOf(a);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  console.log(`\n### ${title}\n`);
  console.log("| | Audits | OK | Refund | p50 OK | p90 OK | p50 visión | p50 captura |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [k, rows] of [...groups.entries()].sort()) {
    const ok = rows.filter((r) => r.status === "succeeded");
    const t = ok.map(secs).filter((v) => v != null);
    const vis = ok.map((r) => r.timings?.visionMs).filter((v) => typeof v === "number").map((v) => v / 1000);
    const cap = ok.map((r) => r.timings?.captureMs).filter((v) => typeof v === "number").map((v) => v / 1000);
    console.log(
      `| ${k} | ${rows.length} | ${ok.length} | ${rows.length - ok.length} | ${fmt(pct(t, 0.5))} | ${fmt(pct(t, 0.9))} | ${fmt(pct(vis, 0.5))} | ${fmt(pct(cap, 0.5))} |`,
    );
  }
}

console.log(
  `# Analyzer latency — ${analyses.length} finished audits since ${since.toISOString().slice(0, 10)}${last ? ` (last ${last})` : ""}`,
);
table("Por día (Guayaquil)", (a) => day(a.created_at));
table("Por modelo", modelOf);
// Who captured the page (analyses.timings.captureProvider, recorded since 2026-10-10). "caché" = served
// from the screenshot cache; "?" = an audit from before this field existed.
table("Por proveedor de captura", (a) => a.timings?.captureProvider ?? (a.timings?.captureCached ? "caché" : "?"));

const ok = analyses.filter((a) => a.status === "succeeded");
const t = ok.map(secs).filter((v) => v != null);
const refunds = analyses.length - ok.length;
const p50 = pct(t, 0.5);
const p90 = pct(t, 0.9);
console.log(`\n### Aceptación (§7.4)\n`);
console.log(`n=${analyses.length} · p50 ${fmt(p50)} (meta ≤ 40 s) · p90 ${fmt(p90)} (meta ≤ 60 s) · refunds ${refunds}/${analyses.length} (meta ≤ 1/10)`);
const pass =
  analyses.length >= 10 &&
  p50 != null && p50 <= 40 &&
  p90 != null && p90 <= 60 &&
  refunds / analyses.length <= 0.1;
console.log(
  analyses.length < 10
    ? "→ todavía no hay 10 audits: sin veredicto."
    : pass
      ? "→ CUMPLE."
      : "→ NO cumple. Mira la tabla por modelo y la columna p50 visión para ver dónde se va el tiempo.",
);
const withTimings = analyses.filter((a) => a.timings).length;
if (withTimings < analyses.length) {
  console.log(
    `\n(${analyses.length - withTimings} audits sin analyses.timings — anteriores a la migración 0034 o al deploy del pipeline nuevo.)`,
  );
}
