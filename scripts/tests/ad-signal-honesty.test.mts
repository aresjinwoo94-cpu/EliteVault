import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { AD_MEASUREMENT_MAX_AGE_DAYS, AD_SOURCE_META, isFreshMeasurement, measuredActiveAds } from "../../lib/library/ad-signal";
import { adLibraryCountries, countActiveAds } from "../../lib/library/meta-ad-library";
import { messages } from "../../lib/i18n/messages";

/**
 * The "N active ads" badge is worded as a LIVE, MEASURED signal. These tests pin the rule that
 * it may only appear for a real, recent Meta Ad Library measurement — and that an AI estimate
 * (`estimated: true`), a seeded count, or a bare timestamp can never pass for one.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const NOW = Date.parse("2026-10-10T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const real = (over: Record<string, unknown> = {}) => ({
  active_ads_count: 120,
  ad_signals: { source: AD_SOURCE_META, measured_at: daysAgo(2), estimated: false, active_ads: 120, ...over },
});

// ── the rule ─────────────────────────────────────────────────────────────────

test("a recent, real Meta measurement is shown", () => {
  const m = measuredActiveAds(real(), NOW);
  assert.deepEqual(m, { count: 120, measuredAt: daysAgo(2) });
});

test("estimated:true is NEVER a measurement — whatever else the row claims", () => {
  assert.equal(measuredActiveAds(real({ estimated: true }), NOW), null);
  // even if it carries the Meta marker and a fresh date
  assert.equal(measuredActiveAds({ active_ads_count: 500, ad_signals: { source: AD_SOURCE_META, measured_at: daysAgo(0), estimated: true } }, NOW), null);
});

test("seeded counts, bare counts and bare timestamps are never measurements", () => {
  // a seed: the shape of the 88 production rows today
  assert.equal(measuredActiveAds({ active_ads_count: 65, ad_signals: null }, NOW), null);
  assert.equal(measuredActiveAds({ active_ads_count: 110, ad_signals: { active_ads: 110, activity_score: 82, estimated: true } as never }, NOW), null);
  // a count with a different/missing source, even if "recent" and not flagged estimated
  assert.equal(measuredActiveAds({ active_ads_count: 90, ad_signals: { source: "discovery_agent", measured_at: daysAgo(1) } }, NOW), null);
  assert.equal(measuredActiveAds({ active_ads_count: 90, ad_signals: { measured_at: daysAgo(1) } }, NOW), null);
  // ads_last_checked_at is not even an input: momentum used to stamp it on every run
  assert.equal(measuredActiveAds({ active_ads_count: 90, ads_last_checked_at: daysAgo(0), ad_signals: {} } as never, NOW), null);
});

test("stale (> 30 days) or future-dated or malformed measurements are not shown", () => {
  assert.equal(AD_MEASUREMENT_MAX_AGE_DAYS, 30);
  assert.ok(measuredActiveAds(real({ measured_at: daysAgo(30) }), NOW));
  assert.equal(measuredActiveAds(real({ measured_at: daysAgo(31) }), NOW), null);
  assert.equal(measuredActiveAds(real({ measured_at: daysAgo(-2) }), NOW), null, "future date");
  for (const bad of [undefined, null, "", "yesterday", 123, {}]) assert.equal(isFreshMeasurement(bad, NOW), false, String(bad));
});

test("zero, negative or non-numeric counts are not shown", () => {
  for (const n of [0, -3, NaN, Infinity, null, undefined, "120"]) {
    assert.equal(measuredActiveAds({ ...real(), active_ads_count: n }, NOW), null, String(n));
  }
});

// ── the winners module end to end ────────────────────────────────────────────

const serverUrl = pathToFileURL(resolve(ROOT, "lib/supabase/server.ts")).href;
mock.module(serverUrl, { exports: { createSupabaseServiceClient: () => ({}) } });
const { loadNicheWinnersModule } = await import("../../lib/library/niche-winners");

const stored = (activeAds: unknown, measuredAt?: string) => ({
  niche: "pet",
  nicheLabel: "Pet",
  scope: "niche",
  winners: [
    { title: "A", domain: "a.com", url: "https://a.com", faviconUrl: "x", nicheLabel: "Pet", exactMatch: true, matchPct: 100, activeAds, activeAdsMeasuredAt: measuredAt, adsUrl: "u", revenue: null },
  ],
});

beforeEach(() => {
  process.env.ENABLE_NICHE_WINNERS = "true";
});
afterEach(() => {
  delete process.env.ENABLE_NICHE_WINNERS;
});

test("old stored audits (seeded counts, no stamp) lose the badge for paying viewers", async () => {
  const mod = await loadNicheWinnersModule({ status: "succeeded", url: "https://mine.com", summary: "", isPaid: true, stored: stored(120) });
  const w = (mod as { winners: { activeAds: number | null }[] }).winners;
  assert.equal(w.length, 1);
  assert.equal(w[0].activeAds, null);
});

test("a stored count survives only with a fresh measurement stamp", async () => {
  const fresh = await loadNicheWinnersModule({ status: "succeeded", url: "https://mine.com", summary: "", isPaid: true, stored: stored(120, new Date().toISOString()) });
  assert.equal((fresh as { winners: { activeAds: number | null }[] }).winners[0].activeAds, 120);
  const stale = await loadNicheWinnersModule({ status: "succeeded", url: "https://mine.com", summary: "", isPaid: true, stored: stored(120, daysAgo(60)) });
  assert.equal((stale as { winners: { activeAds: number | null }[] }).winners[0].activeAds, null);
});

// ── momentum + meta client ───────────────────────────────────────────────────

test("momentum writes the measurement marker only on a real Meta answer and no longer stamps 'checked' on rows Meta never answered", () => {
  const src = read("scripts/library/momentum.mts");
  assert.match(src, /measuredSignals = \{[\s\S]*?source: "meta_ad_library"[\s\S]*?measured_at: now[\s\S]*?estimated: false/);
  assert.match(src, /ads_last_checked_at: adsCheckedAt,/);
  assert.doesNotMatch(src, /ads_last_checked_at: adsCheckedAt \?\? now/);
});

test("the Meta client queries the EU by default (commercial ads are public only there) and honours an override", () => {
  assert.deepEqual(adLibraryCountries({}), ["DE", "FR", "ES", "IT", "NL"]);
  assert.deepEqual(adLibraryCountries({ META_AD_LIBRARY_COUNTRIES: "gb, de ,xx1,fr" }), ["GB", "DE", "FR"]);
  assert.deepEqual(adLibraryCountries({ META_AD_LIBRARY_COUNTRIES: "" }), ["DE", "FR", "ES", "IT", "NL"]);
});

test("countActiveAds sends the EU countries and returns null (never 0) when Meta refuses", async () => {
  process.env.META_AD_LIBRARY_TOKEN = "t";
  const real = globalThis.fetch;
  let seen = "";
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    seen = String(u);
    return new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 });
  }) as typeof fetch;
  try {
    const r = await countActiveAds("Allbirds");
    assert.equal(r.activeAds, null);
    assert.match(decodeURIComponent(seen), /ad_reached_countries=\["DE","FR","ES","IT","NL"\]/);
  } finally {
    globalThis.fetch = real;
    delete process.env.META_AD_LIBRARY_TOKEN;
  }
});

// ── the words ────────────────────────────────────────────────────────────────

const CLAIMS =
  /live portfolio|portafolio (de ganadores )?en vivo|watches paid[- ]social|monitors paid[- ]social|vigila(n)? (los )?cohortes|monitoriza continuamente|re-?validated by the AI|drop out automatically|salen automáticamente|live metrics|métricas en vivo|live Meta ad counts|recuento de anuncios de Meta en vivo|(?<!not a )live Meta Ad Library count|(?<!no es un )recuento en vivo de la Meta Ad Library|validated by real revenue signals|validadas? por señales reales de ingresos|live library of winning|biblioteca viva|librería en vivo|Estimated from public Meta Ad Library signals/i;

test("no user-facing copy claims live monitoring, live metrics or live Meta counts that don't happen", () => {
  const hits: string[] = [];
  const scan = (label: string, text: string) => {
    const m = text.match(CLAIMS);
    if (m) hits.push(`${label}: "${m[0]}"`);
  };
  for (const f of ["lib/i18n/dict/ui-en.json", "lib/i18n/dict/ui-es.json", "lib/i18n/messages.ts", "lib/content/faq.ts", "app/winning-shopify-stores/page.tsx", "app/winning-shopify-stores/[niche]/page.tsx", "components/analyzer/niche-winners.tsx", "components/library/site-card.tsx"]) {
    scan(f, read(f));
  }
  for (const l of ["en", "es"] as const) scan(`messages.${l}`, JSON.stringify(messages[l]));
  assert.deepEqual(hits, []);
});

test("the landing's winners card promises a curated library with labelled estimates (en + es), and the chip reads Est.", () => {
  const en = (messages.en as unknown as { features: Record<string, string> }).features;
  const es = (messages.es as unknown as { features: Record<string, string> }).features;
  assert.equal(en.feature1Title, "A curated library of winners");
  assert.equal(es.feature1Title, "Una biblioteca curada de ganadores");
  assert.match(en.feature1Body, /estimates and labelled/);
  assert.match(es.feature1Body, /estimaciones modeladas y se etiquetan/);
  assert.equal(en.feature1Live, "Est.");
  assert.equal(es.feature1Live, "Est.");
});

test("the badge is rendered only from a usable (i.e. measured) count; the tooltip says what it is", () => {
  const ui = read("components/analyzer/niche-winners.tsx");
  assert.match(ui, /const showAds = usable\(w\.activeAds\);/);
  assert.match(ui, /\{showAds && <AdsBadge n=\{w\.activeAds as number\} \/>\}/);
  const en = (messages.en as unknown as { nicheWinners: Record<string, string> }).nicheWinners;
  assert.match(en.realSignal, /Measured count from the Meta Ad Library/);
});
