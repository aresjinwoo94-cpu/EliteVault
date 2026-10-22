// A2 — aggregated, read-only statistics over completed EliteVault audits (blog data).
//
// Run:   node docs/blog-data/a2-aggregates.mjs        (from the repo root, needs .env.local)
// Writes docs/blog-data/a2-aggregates.json. Re-running reproduces the figures; the data keeps growing, so
// the JSON records the exact window ("from"/"to") and n that every published number must quote.
//
// Rules (brief docs/blog-sistema-elitevault-skill.md §A2):
//   * SELECT only (see scripts/blog/_supa.mjs). Nothing is written to the database.
//   * Only aggregates with n >= 30 are marked publishable. Smaller cuts are kept as `publishable: false`.
//   * No PII: no URLs, emails, user ids or store names ever leave this script. Domains are used in memory
//     to de-duplicate and are never written out.
//   * Unit of analysis = one store DOMAIN (its most recent succeeded audit), so a store audited ten times
//     counts once. Audits whose capture was blocked by an anti-bot screen are excluded (the score of such a
//     run describes the interstitial, not the store), and so are audits run from the team's own account.
//   * `modeled_*` figures come from the product's deterministic ROAS model (lib/meta/roas-range.ts): they are
//     MODELED ranges, never results. Every consumer must say "modeled".
import fs from "node:fs";
import { select } from "../../scripts/blog/_supa.mjs";

const MIN_N = 30;
const OWNER_EMAIL = "aresjinwoo94@gmail.com"; // team account, excluded (internal tests)

// ── same math as lib/meta/roas-range.ts (kept in sync by tests/blog-data-sync below) ───────────────────
const NICHE_BANDS = [
  { keys: ["skincare", "beauty", "cosmetic", "makeup", "grooming"], band: [1.8, 3.5] },
  { keys: ["supplement", "vitamin", "health", "nutrition", "wellness"], band: [1.2, 2.5] },
  { keys: ["jewel", "jewellery", "watch"], band: [2.0, 4.0] },
  { keys: ["pet", "dog", "cat"], band: [2.0, 4.0] },
  { keys: ["fashion", "apparel", "clothing", "wear", "footwear", "shoe"], band: [1.5, 3.0] },
  { keys: ["home", "decor", "furniture", "kitchen"], band: [1.5, 3.0] },
  { keys: ["fitness", "gym", "sport", "athletic"], band: [1.5, 3.0] },
  { keys: ["electronic", "gadget", "tech"], band: [1.2, 2.5] },
  { keys: ["food", "snack", "beverage", "drink", "coffee", "tea"], band: [1.3, 2.5] },
  { keys: ["toy", "kid", "baby"], band: [1.5, 3.0] },
  { keys: ["accessor", "eyewear", "glasses"], band: [1.5, 2.5] },
];
const DEFAULT_BAND = [1.4, 2.8];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round1 = (n) => Math.round(n * 10) / 10;
function roasRange(score, niche) {
  const n = (niche ?? "").toLowerCase();
  const [bl, bh] = (NICHE_BANDS.find((b) => b.keys.some((k) => n.includes(k))) ?? { band: DEFAULT_BAND }).band;
  const s = clamp(Number.isFinite(score) ? score : 0, 0, 100);
  const f = 0.35 + ((clamp(s, 20, 90) - 20) / 70) * 0.75;
  let low = round1(bl * f);
  let high = round1(bh * f);
  if (high - low < 0.3) high = round1(low + 0.3);
  low = Math.max(0.3, low);
  return { low, high, ready: s >= 55 && high >= 1.8 };
}

// ── issue themes: keyword match over the model-written fix titles (method disclosed in the JSON) ───────
const THEMES = {
  trust_and_social_proof: /review|testimonial|trust|proof|badge|guarantee|rating|credib|secur|ugc/i,
  shipping_returns_policies: /shipping|delivery|return|refund|polic|warranty|exchange/i,
  hero_headline_offer: /hero|headline|value prop|offer|above the fold|above-the-fold|tagline|subhead|first impression/i,
  cta_and_buy_path: /\bcta\b|call to action|call-to-action|add to cart|button|checkout|buy now/i,
  product_imagery: /image|photo|visual|gallery|video|lifestyle|imagery/i,
  product_page_copy: /description|copy|benefit|feature|product page|pdp|spec|size guide|faq/i,
  mobile_and_speed: /mobile|speed|load|performance|lcp|slow|responsive/i,
  navigation_and_layout: /navigation|menu|layout|hierarchy|spacing|clutter|collection|filter|search/i,
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

const owner = (await select("profiles", `select=id&email=eq.${encodeURIComponent(OWNER_EMAIL)}`))[0]?.id ?? null;
const rows = await select(
  "analyses",
  "select=url,user_id,created_at,detected_niche,result&status=eq.succeeded&order=created_at.asc",
  { pageSize: 200, max: 20000 },
);

const total = rows.length;
const latestByDomain = new Map();
let blocked = 0;
let internal = 0;
for (const r of rows) {
  if (owner && r.user_id === owner) { internal++; continue; }
  if (r.result?.capture_blocked?.detected === true) { blocked++; continue; }
  const d = host(r.url);
  if (!d || !r.result) continue;
  latestByDomain.set(d, r); // ascending order ⇒ last write wins = most recent audit of that domain
}
const set = [...latestByDomain.values()];
const dates = set.map((r) => r.created_at).sort();
const window = { from: dates[0]?.slice(0, 10), to: dates.at(-1)?.slice(0, 10) };
const n = set.length;

const out = {
  generated_at: new Date().toISOString(),
  method: {
    unit: "one store domain = its most recent succeeded audit",
    exclusions: { team_account_audits: internal, capture_blocked_audits: blocked },
    succeeded_audits_read: total,
    window,
    n_distinct_domains: n,
    issue_themes:
      "keyword match (regex, see THEMES in a2-aggregates.mjs) over the model-written top_fixes titles; a fix can match several themes. This measures what the audit flagged, not an independent inspection of the store.",
    modeled:
      "roas_* figures use lib/meta/roas-range.ts (score + niche). They are modeled ranges, not campaign results.",
  },
  publishable_min_n: MIN_N,
  sample_caveat:
    "Self-selected: these are stores whose owners chose to audit them with EliteVault (often because they suspect a problem). Not a random sample of Shopify stores; never generalize to \"all stores\".",
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
const norm = (v) => { const x = Number(v ?? 0); return x > 1 ? x : x * 100; };
const catStats = {};
for (const c of CATS) {
  const vals = withCats.map((r) => norm(r.result.category_scores[c])).filter(Number.isFinite);
  catStats[c] = { mean: mean(vals), median: Math.round(median(vals) * 10) / 10 };
}
stat("category_scores_0_100", withCats.length, catStats);
const weakest = Object.fromEntries(CATS.map((c) => [c, 0]));
for (const r of withCats) {
  const sorted = [...CATS].sort((a, b) => norm(r.result.category_scores[a]) - norm(r.result.category_scores[b]));
  weakest[sorted[0]]++;
}
stat("weakest_category_share_pct", withCats.length, Object.fromEntries(Object.entries(weakest).map(([k, v]) => [k, pct(v, withCats.length)])), "share of stores whose LOWEST category score is this one. Caveat: the model scores the CRO category lowest in most audits, so read this as a property of the audit rubric, not as a measurement of store quality.");

// 3 — issue themes
const withFixes = set.filter((r) => Array.isArray(r.result.top_fixes) && r.result.top_fixes.length);
const themeHits = Object.fromEntries(Object.keys(THEMES).map((k) => [k, 0]));
for (const r of withFixes) {
  const text = r.result.top_fixes.map((f) => `${f?.title ?? ""} ${f?.why ?? ""}`).join(" | ");
  for (const [k, re] of Object.entries(THEMES)) if (re.test(text)) themeHits[k]++;
}
stat("issue_theme_share_pct", withFixes.length, Object.fromEntries(Object.entries(themeHits).map(([k, v]) => [k, pct(v, withFixes.length)])), "share of audits whose top fixes mention the theme");

// 4 — annotations
const withAnn = set.filter((r) => Array.isArray(r.result.annotations));
stat("annotations", withAnn.length, {
  mean_per_audit: mean(withAnn.map((r) => r.result.annotations.length)),
  share_with_high_severity_pct: pct(withAnn.filter((r) => r.result.annotations.some((a) => a?.severity === "high")).length, withAnn.length),
});

// 5 — modeled 7-day ROAS band (cold traffic) from score + niche
const modeled = set.filter((r) => Number.isFinite(Number(r.result.score)));
const rr = modeled.map((r) => roasRange(Number(r.result.score), r.detected_niche ?? ""));
stat("modeled_roas_7d", modeled.length, {
  share_low_end_below_1x_pct: pct(rr.filter((x) => x.low < 1).length, rr.length),
  share_ready_to_scale_pct: pct(rr.filter((x) => x.ready).length, rr.length),
  median_low: median(rr.map((x) => x.low)),
  median_high: median(rr.map((x) => x.high)),
}, "MODELED from audit score + niche; never a campaign result");

// 6 — per-niche cuts (only niches with n >= MIN_N are publishable)
const byNiche = {};
for (const r of set) (byNiche[r.detected_niche ?? "unclassified"] ??= []).push(r);
out.stats.by_niche = {};
for (const [niche, list] of Object.entries(byNiche)) {
  const fx = list.filter((r) => Array.isArray(r.result.top_fixes) && r.result.top_fixes.length);
  const th = Object.fromEntries(Object.keys(THEMES).map((k) => [k, pct(fx.filter((r) => THEMES[k].test(r.result.top_fixes.map((f) => `${f?.title ?? ""} ${f?.why ?? ""}`).join(" | "))).length, fx.length)]));
  const vv = list.map((r) => r.result.ad_readiness?.verdict).filter(Boolean);
  out.stats.by_niche[niche] = {
    n: list.length,
    publishable: list.length >= MIN_N && niche !== "unclassified",
    ...(list.length >= MIN_N && niche !== "unclassified"
      ? {
          ad_readiness_not_ready_pct: pct(vv.filter((v) => v === "not_ready").length, vv.length),
          issue_theme_share_pct: th,
        }
      : {}),
  };
}

fs.writeFileSync(new URL("./a2-aggregates.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ method: out.method, stats: Object.fromEntries(Object.entries(out.stats).map(([k, v]) => [k, v.n ?? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b.n]))])) }, null, 2));
