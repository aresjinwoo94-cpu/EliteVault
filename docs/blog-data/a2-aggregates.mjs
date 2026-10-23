// A2 — aggregated, read-only statistics over completed EliteVault audits (blog data).
//
// Run:   node docs/blog-data/a2-aggregates.mjs        (from the repo root, needs .env.local)
// Writes docs/blog-data/a2-aggregates.json. Re-running reproduces the figures; the data keeps growing, so
// the JSON records the exact window ("from"/"to") and n that every published number must quote.
//
// Optional .env.local variable (never committed): BLOG_EXCLUDE_EMAILS=a@x.com,b@y.com  → team accounts whose
// audits (tests) are excluded. Without it nothing is excluded and the JSON says so.
//
// Rules (brief docs/blog-sistema-elitevault-skill.md §A2):
//   * SELECT only (see scripts/blog/_supa.mjs). Nothing is written to the database.
//   * Only aggregates with n >= 30 are marked publishable. Smaller cuts are kept as `publishable: false`.
//   * No PII: no URLs, emails, user ids or store names ever leave this script. Domains are used in memory
//     to de-duplicate and are never written out.
//   * Unit of analysis = one store DOMAIN (its most recent succeeded audit), so a store audited ten times
//     counts once. Excluded: audits whose capture was blocked by an anti-bot screen (their score describes the
//     interstitial, not the store), degenerate audits (score 0 or every category 0) and audits run from the
//     team accounts.
//   * `modeled_*` figures come from the product's deterministic ROAS model (lib/meta/roas-range.ts, copied in
//     roas-model.mjs and kept in sync by scripts/tests/blog-data-sync.test.ts). They are MODELED ranges, never
//     results, and they use the audit's DETECTED niche (the product panel uses the domain's first label, which
//     mostly falls into the default band), so they are not "what the panel shows".
import fs from "node:fs";
import { select, loadEnv } from "../../scripts/blog/_supa.mjs";
import { roasRange } from "./roas-model.mjs";

const MIN_N = 30;
const EXCLUDE_EMAILS = (loadEnv().BLOG_EXCLUDE_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ── issue themes: keyword match over the model-written fix titles AND their `why` ─────────────────────
// Word boundaries matter: a bare /spec/ matches "specific", /load/ matches "download".
const THEMES = {
  trust_and_social_proof: /\b(review|testimonial|trust|proof|badge|guarantee|rating|credib\w*|secur\w*|ugc)/i,
  shipping_returns_policies: /\b(shipping|delivery|return|refund|polic(y|ies)|warranty|exchange)/i,
  hero_headline_offer: /\b(hero|headline|value prop\w*|offer|above[- ]the[- ]fold|tagline|subhead\w*|first impression)/i,
  cta_and_buy_path: /(\bcta\b|call[- ]to[- ]action|add to cart|\bbutton|\bcheckout|buy now)/i,
  product_imagery: /\b(image|photo|visual|gallery|video|lifestyle|imagery)/i,
  product_page_copy: /\b(description|copy|benefit|feature|product page|pdp|spec(s|ification|ifications)?\b|size guide|faq)/i,
  mobile_and_speed: /\b(mobile|speed|load(s|ed|ing)?\b|performance|lcp|slow|responsive)/i,
  navigation_and_layout: /\b(navigation|menu|layout|hierarchy|spacing|clutter|collection|filter|search)/i,
};
const CATS = ["color_integration", "layout_proportion", "image_quality", "technical_optimization", "niche_coherence", "cro_principles"];

const host = (u) => {
  try {
    return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
/** Category scores come as 0–100 (current) or 0–1 (old audits). Decide per audit from the whole set of six. */
const scale100 = (cs) => {
  const v = CATS.map((c) => Number(cs?.[c]));
  const max = Math.max(...v.filter(Number.isFinite));
  const f = max <= 1 ? 100 : 1;
  return Object.fromEntries(CATS.map((c, i) => [c, Number.isFinite(v[i]) ? v[i] * f : NaN]));
};
const score100 = (s) => {
  const x = Number(s);
  return !Number.isFinite(x) ? NaN : x <= 1 ? x * 100 : x;
};

const teamIds = new Set();
for (const e of EXCLUDE_EMAILS) {
  const [p] = await select("profiles", `select=id&email=eq.${encodeURIComponent(e)}`);
  if (p?.id) teamIds.add(p.id);
}
const rows = await select(
  "analyses",
  "select=url,user_id,created_at,detected_niche,result&status=eq.succeeded&order=created_at.asc",
  { pageSize: 200, max: 20000 },
);

const total = rows.length;
const latestByDomain = new Map();
let blocked = 0;
let internal = 0;
let degenerate = 0;
for (const r of rows) {
  if (r.user_id && teamIds.has(r.user_id)) { internal++; continue; }
  if (r.result?.capture_blocked?.detected === true) { blocked++; continue; }
  const d = host(r.url);
  if (!d || !r.result) continue;
  const cs = r.result.category_scores ? scale100(r.result.category_scores) : null;
  const sc = score100(r.result.score);
  if ((cs && CATS.every((c) => !(cs[c] > 0))) || sc === 0) { degenerate++; continue; }
  latestByDomain.set(d, r); // ascending order ⇒ last write wins = most recent audit of that domain
}
const entries = [...latestByDomain.entries()];
const set = entries.map(([, r]) => r);
const dates = set.map((r) => r.created_at).sort();
const n = set.length;

// sample composition (so a reader can judge how much to trust the figures)
const byUser = {};
for (const r of set) if (r.user_id) byUser[r.user_id] = (byUser[r.user_id] || 0) + 1;
const biggest = Math.max(0, ...Object.values(byUser));
const testLike = entries.filter(([d]) => /(^|\.)(demo|test|example|localhost)|myshopify\.com$|^store\d*\./.test(d)).length;

const out = {
  generated_at: new Date().toISOString(),
  method: {
    unit: "one store domain = its most recent succeeded audit",
    exclusions: {
      team_account_audits: internal,
      team_accounts_configured: teamIds.size,
      capture_blocked_audits: blocked,
      degenerate_audits_score_0_or_all_categories_0: degenerate,
    },
    succeeded_audits_read: total,
    window: { from: dates[0]?.slice(0, 10), to: dates.at(-1)?.slice(0, 10) },
    n_distinct_domains: n,
    sample_composition: {
      anonymous_pre_login_pct: pct(set.filter((r) => !r.user_id).length, n),
      largest_single_account_pct: pct(biggest, n),
      test_looking_domains: testLike,
      note: "Not cleaned of every test store; a domain is counted once, however many times it was audited.",
    },
    issue_themes:
      "word-boundary keyword match (regex, see THEMES in a2-aggregates.mjs) over the model-written top_fixes `title` AND `why`; a fix can match several themes. This measures what the audit flagged, not an independent inspection of the store.",
    modeled:
      "modeled_roas_7d uses lib/meta/roas-range.ts with the audit score (0–100) and the DETECTED niche. It is a modeled range, never a campaign result, and not identical to the panel the product shows (which classifies the domain's first label).",
  },
  publishable_min_n: MIN_N,
  sample_caveat:
    "Self-selected: these are stores whose owners (or anonymous visitors) chose to audit them with EliteVault, often because they suspect a problem. Not a random sample of Shopify stores; never generalize to \"all stores\".",
  stats: {},
};

function stat(key, n_, value, note) {
  out.stats[key] = { n: n_, publishable: n_ >= MIN_N, ...(note ? { note } : {}), value };
}

// 1 — ad-readiness verdicts
const verdicts = set.map((r) => r.result.ad_readiness?.verdict).filter(Boolean);
const vc = { ready: 0, almost: 0, not_ready: 0 };
verdicts.forEach((v) => v in vc && vc[v]++);
stat("ad_readiness_verdict_share_pct", verdicts.length, Object.fromEntries(Object.entries(vc).map(([k, v]) => [k, pct(v, verdicts.length)])), "share of audited stores per verdict");

// 2 — category scores (mean / median) and which category is weakest
const withCats = set.filter((r) => r.result.category_scores);
const catRows = withCats.map((r) => scale100(r.result.category_scores));
const catStats = {};
for (const c of CATS) {
  const vals = catRows.map((x) => x[c]).filter(Number.isFinite);
  catStats[c] = { mean: mean(vals), median: Math.round(median(vals) * 10) / 10 };
}
stat("category_scores_0_100", withCats.length, catStats);
const weakest = Object.fromEntries(CATS.map((c) => [c, 0]));
let weakestN = 0;
for (const x of catRows) {
  const vals = CATS.map((c) => x[c]);
  if (vals.some((v) => !Number.isFinite(v))) continue;
  const min = Math.min(...vals);
  const tied = CATS.filter((c) => x[c] === min);
  if (tied.length === CATS.length) continue; // all equal: no weakest category
  weakestN++;
  tied.forEach((c) => (weakest[c] += 1 / tied.length)); // ties split evenly, not by list order
}
stat("weakest_category_share_pct", weakestN, Object.fromEntries(Object.entries(weakest).map(([k, v]) => [k, pct(v, weakestN)])), "share of stores whose LOWEST category score is this one (ties split evenly). Caveat: the model scores the CRO category lowest in most audits, so read this as a property of the audit rubric, not as a measurement of store quality.");

// 3 — issue themes
const fixText = (r) => r.result.top_fixes.map((f) => `${f?.title ?? ""} ${f?.why ?? ""}`).join(" | ");
const withFixes = set.filter((r) => Array.isArray(r.result.top_fixes) && r.result.top_fixes.length);
const themeHits = Object.fromEntries(Object.keys(THEMES).map((k) => [k, 0]));
for (const r of withFixes) for (const [k, re] of Object.entries(THEMES)) if (re.test(fixText(r))) themeHits[k]++;
stat("issue_theme_share_pct", withFixes.length, Object.fromEntries(Object.entries(themeHits).map(([k, v]) => [k, pct(v, withFixes.length)])), "share of audits whose top fixes mention the theme");

// 4 — annotations
const withAnn = set.filter((r) => Array.isArray(r.result.annotations));
stat("annotations", withAnn.length, {
  mean_per_audit: mean(withAnn.map((r) => r.result.annotations.length)),
  share_with_high_severity_pct: pct(withAnn.filter((r) => r.result.annotations.some((a) => a?.severity === "high")).length, withAnn.length),
});

// 5 — modeled 7-day ROAS band (cold traffic) from score + detected niche
const modeled = set.filter((r) => Number.isFinite(score100(r.result.score)));
const rr = modeled.map((r) => roasRange(score100(r.result.score), r.detected_niche ?? ""));
stat("modeled_roas_7d", modeled.length, {
  share_low_end_below_1x_pct: pct(rr.filter((x) => x.low < 1).length, rr.length),
  share_ready_to_scale_pct: pct(rr.filter((x) => x.ready).length, rr.length),
  median_low: median(rr.map((x) => x.low)),
  median_high: median(rr.map((x) => x.high)),
}, "MODELED from audit score + detected niche; never a campaign result");

// 6 — per-niche cuts (only niches with n >= MIN_N are publishable; "unclassified" is not a niche)
const byNiche = {};
for (const r of set) (byNiche[r.detected_niche ?? "unclassified"] ??= []).push(r);
out.stats.by_niche = {};
for (const [niche, list] of Object.entries(byNiche)) {
  const ok = list.length >= MIN_N && niche !== "unclassified";
  const fx = list.filter((r) => Array.isArray(r.result.top_fixes) && r.result.top_fixes.length);
  const th = Object.fromEntries(Object.keys(THEMES).map((k) => [k, pct(fx.filter((r) => THEMES[k].test(fixText(r))).length, fx.length)]));
  const vv = list.map((r) => r.result.ad_readiness?.verdict).filter(Boolean);
  out.stats.by_niche[niche] = {
    n: list.length,
    publishable: ok,
    ...(ok ? { ad_readiness_not_ready_pct: pct(vv.filter((v) => v === "not_ready").length, vv.length), issue_theme_share_pct: th } : {}),
  };
}

fs.writeFileSync(new URL("./a2-aggregates.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ method: out.method, n: Object.fromEntries(Object.entries(out.stats).map(([k, v]) => [k, v.n ?? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b.n]))])) }, null, 2));
