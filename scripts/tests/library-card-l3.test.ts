import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toCardPayload } from "../../lib/library/card-payload";
import { AD_SOURCE_META } from "../../lib/library/ad-signal";
import { messages } from "../../lib/i18n/messages";

/** WP-L3 (brief oct-2026, owner decision L-D1): the Library card and the public niche pages show only verifiable facts. */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const NOW = new Date().toISOString();
const OLD = new Date(Date.now() - 60 * 86_400_000).toISOString();

test("card payload: an ad count reaches the browser ONLY for a real, fresh Meta Ad Library measurement", () => {
  const row = { id: "1", title: "T", niche: "pet", metrics: { ctr: 2 }, ad_signals: { source: AD_SOURCE_META, measured_at: NOW, estimated: false, activity_score: 88 }, active_ads_count: 42 };
  const p = toCardPayload(row) as Record<string, unknown>;
  assert.equal(p.measured_ads, 42);
  assert.ok(!("ad_signals" in p) && !("active_ads_count" in p), "raw estimate fields never ship");
  // seeds / estimates / stale / missing marker → null
  assert.equal(toCardPayload({ ...row, ad_signals: { source: AD_SOURCE_META, measured_at: NOW, estimated: true } }).measured_ads, null);
  assert.equal(toCardPayload({ ...row, ad_signals: { activity_score: 80, estimated: true } }).measured_ads, null);
  assert.equal(toCardPayload({ ...row, ad_signals: { source: AD_SOURCE_META, measured_at: OLD, estimated: false } }).measured_ads, null, "stale");
  assert.equal(toCardPayload({ ...row, ad_signals: null }).measured_ads, null);
  assert.equal(toCardPayload({ ...row, active_ads_count: 0 }).measured_ads, null);
});

test("the search action sends the derived payload, not the raw ad fields", () => {
  const src = read("app/actions/search.ts");
  assert.match(src, /toCardPayload\(raw as unknown as Record<string, unknown>\)/);
  assert.ok(src.indexOf("applyMetricsCap(items, plan)") < src.indexOf("toCardPayload("), "the plan gate still runs first");
});

test("Library card: name, niche, Shopify badge (verified only) and measured ads — no estimates, no /100", () => {
  const raw = read("components/library/site-card.tsx");
  const src = strip(raw);
  for (const banned of [/\bctr\b/i, /\broi\b/i, /conv_rate/, /traffic_est/, /estConv/, /siteCard\.traffic/, /activity_score/, /ad_signals/, /\/100/, /ai_reason/, /formatCompact/]) {
    assert.doesNotMatch(src, banned, String(banned));
  }
  assert.match(src, /site\.shopify_verified &&/, "badge only when verified");
  assert.match(src, /typeof site\.measured_ads === "number"/, "ads only when measured");
  assert.match(src, /\{site\.title\}/);
  assert.match(src, /site\.niche/);
});

test("Library card: the whole card is a link to the store (stretched link), save/teardown stay clickable, event fires", () => {
  const src = strip(read("components/library/site-card.tsx"));
  assert.match(src, /href=\{site\.url\}/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
  assert.match(src, /after:absolute after:inset-0/, "stretched link");
  // the controls sit above the stretched link
  assert.match(src, /relative z-10 flex shrink-0 items-center gap-1[\s\S]*?<TeardownDialog[\s\S]*?<SaveButton/);
  // the card root is the positioned ancestor of the ::after
  assert.match(src, /"group relative overflow-hidden rounded-2xl border/);
  assert.match(src, /phCapture\("library_store_click", \{\s*domain: site\.domain,\s*niche: site\.niche,\s*position: index \+ 1,\s*locked,?\s*\}\)/);
});

test("locked cards carry no overlay at all: nothing on the card is locked any more, so no hover/blur layer can ever swallow the link click", () => {
  const src = strip(read("components/library/site-card.tsx"));
  assert.doesNotMatch(src, /data-locked-chip|opacity-0 md:group-hover|backdrop-blur|unlockPro|proChip|<Lock\b/);
  assert.match(src, /locked,?\s*\}\)/, "locked still travels in the analytics event");
});

test("public niche pages and their data layer carry no invented metrics and no /100", () => {
  const page = strip(read("app/winning-shopify-stores/[niche]/page.tsx"));
  const data = strip(read("lib/library/niche-pages.ts"));
  for (const banned of [/convRate/, /avgConv/, /conv_rate/, /nichePage\.estConv/, /nichePage\.metrics/, /nichePage\.estimateNote/, /nichePage\.avg\b/, /\/100/, /modeled conversion/i]) {
    assert.doesNotMatch(page, banned, `page ${banned}`);
    assert.doesNotMatch(data, banned, `data ${banned}`);
  }
  assert.match(data, /measuredActiveAds\(/);
  assert.match(data, /shopify_verified === true/);
  assert.match(page, /s\.shopifyVerified/);
  assert.match(page, /s\.measuredAds !== null/);
  // the English JSON-LD FAQ no longer claims modeled CTR / conversion numbers
  assert.doesNotMatch(read("app/winning-shopify-stores/[niche]/page.tsx"), /estimates modeled from public signals|conversion score/);
});

test("i18n: the removed estimate strings are gone in EN and ES, the new ones exist", () => {
  for (const locale of ["en", "es"] as const) {
    const ui = JSON.parse(read(`lib/i18n/dict/ui-${locale}.json`)) as Record<string, Record<string, string>>;
    for (const k of ["adActivity", "adActivityNote", "estConv", "traffic", "convAria", "metricsNote", "unlockPro"]) assert.ok(!(k in ui.siteCard), `${locale}.siteCard.${k}`);
    for (const k of ["metaAds", "opensStore"]) assert.ok(ui.siteCard[k], `${locale}.siteCard.${k}`);
    assert.match(ui.siteCard.metaAds, /\{n\}/);
    for (const k of ["avg", "estConv", "metrics", "estimateNote", "faqAvg"]) assert.ok(!(k in ui.nichePage), `${locale}.nichePage.${k}`);
    assert.doesNotMatch(ui.nichePage.faqA0 + ui.nichePage.faqA1 + ui.nichePage.faqA2, /\{avg\}|\{pct\}|conversion rate|tasa de conversión/i, `${locale} faq`);
  }
  assert.ok(messages.en);
});

test("the Library view no longer prints the 'estimated figures' disclaimer (there are no estimated figures left)", () => {
  assert.doesNotMatch(read("components/library/library-view.tsx"), /libraryView\.metricsNote/);
  for (const locale of ["en", "es"] as const) {
    const v = (JSON.parse(read(`lib/i18n/dict/ui-${locale}.json`)) as { libraryView: Record<string, string> }).libraryView;
    assert.ok(!("metricsNote" in v));
    assert.doesNotMatch(v.subFree + v.unlockBody, /full metrics|métricas completas|métricas de cada|metrics on every/i, locale);
  }
});
