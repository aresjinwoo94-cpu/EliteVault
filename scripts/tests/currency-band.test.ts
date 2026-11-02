import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RANKS } from "../../lib/growth-map/ranks";
import { formatBand } from "../../lib/currency/band";
import { potentialBandForResult, potentialBandUsd } from "../../lib/analyzer/report-v2";

const en = { perMonth: "/mo", firstSales: "first sales" };
const es = { perMonth: "/mes", firstSales: "primeras ventas" };
const mxn = { code: "MXN", rate: 18, locale: "en" as const };
const mxnEs = { code: "MXN", rate: 18, locale: "es" as const };
const usd = { code: "USD", rate: 1, locale: "en" as const };

test("every rank's bandUsd matches its legacy band text (no drift between the two)", () => {
  const k = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1000}k`);
  for (const r of RANKS) {
    const b = r.bandUsd;
    if (b.max === 0) assert.equal(r.band, "$0 – first sales");
    else if (b.max === null) assert.equal(r.band, `$${k(b.min)}+/mo`);
    else assert.equal(r.band, `~$${k(b.min)}–${k(b.max)}/mo`, r.key);
    assert.equal(b.perMonth, b.max !== 0);
  }
});

test("bands are contiguous and increasing", () => {
  for (let i = 1; i < RANKS.length; i++) {
    const prev = RANKS[i - 1].bandUsd;
    assert.ok(RANKS[i].bandUsd.min >= (prev.max ?? prev.min), RANKS[i].key);
  }
});

test("USD or no context returns the legacy band text byte for byte", () => {
  for (const r of RANKS) {
    for (const ctx of [null, usd]) {
      assert.equal(formatBand(r.bandUsd, r.band, ctx, en), r.band);
      assert.equal(formatBand(r.bandUsd, r.band, ctx, es), r.band);
    }
  }
});

test("an unusable rate falls back to the legacy text", () => {
  for (const rate of [0, NaN, -1, Infinity]) {
    assert.equal(formatBand(RANKS[2].bandUsd, RANKS[2].band, { ...mxn, rate }, en), RANKS[2].band);
  }
});

test("MXN (en): approximate, compact, per month; edge cases", () => {
  assert.equal(formatBand(RANKS[1].bandUsd, RANKS[1].band, mxn, en), "≈ MX$18k–MX$144k/mo");
  assert.equal(formatBand(RANKS[2].bandUsd, RANKS[2].band, mxn, en), "≈ MX$360k–MX$1.4M/mo");
  assert.equal(formatBand(RANKS[0].bandUsd, RANKS[0].band, mxn, en), "MX$0 – first sales");
  assert.equal(formatBand(RANKS[5].bandUsd, RANKS[5].band, mxn, en), "≈ MX$18M+/mo");
});

test("MXN (es): i18n labels, never the English words", () => {
  assert.match(formatBand(RANKS[1].bandUsd, RANKS[1].band, mxnEs, es), /\/mes$/);
  assert.match(formatBand(RANKS[0].bandUsd, RANKS[0].band, mxnEs, es), /primeras ventas$/);
  assert.doesNotMatch(formatBand(RANKS[0].bandUsd, RANKS[0].band, mxnEs, es), /first sales/);
});

test("no local band reads as a bare $ (MXN/COP/ARS/CAD)", () => {
  for (const code of ["MXN", "COP", "ARS", "CAD"]) {
    for (const r of RANKS) {
      const s = formatBand(r.bandUsd, r.band, { code, rate: 10, locale: "en" }, en);
      assert.doesNotMatch(s, /(^|[^A-Z])\$\d/, `${code} ${r.key}: ${s}`);
    }
  }
});

test("potentialBandUsd is the placement's own band (same rank as potentialBandForResult)", () => {
  assert.equal(potentialBandUsd(null), null);
  assert.equal(potentialBandUsd(undefined), null);
  assert.equal(potentialBandForResult(null), null);
});

test("wiring: hero, growth map, map canvas and dashboard use the visitor's currency; OG/meta stay USD", () => {
  const root = join(import.meta.dirname, "..", "..");
  const src = (p: string) => readFileSync(join(root, p), "utf8");
  assert.match(src("components/analyzer/report-hero-v2.tsx"), /useBandLabel/);
  assert.match(src("components/analyzer/growth-map/growth-map.tsx"), /bandLabel\(rank\.bandUsd, rank\.band\)/);
  assert.match(src("components/analyzer/growth-map/map-canvas.tsx"), /bandLabel\(rank\.bandUsd, rank\.band\)/);
  assert.match(src("app/(app)/app/page.tsx"), /formatBand\(/);
  // SEO surfaces keep reading the USD text
  assert.doesNotMatch(src("lib/analyzer/share-v2.ts"), /formatBand|useBandLabel|currency/);
  assert.doesNotMatch(src("app/s/[slug]/opengraph-image.tsx"), /formatBand|useBandLabel|currency/);
});

const norm = (x: string) => x.replace(/ /g, " ");

test("huge-figure currencies stay readable and consistent (es: k / M / mil M, no 'K' mix, no 376.4 k)", () => {
  const cop = { code: "COP", rate: 4100, locale: "es" as const };
  assert.equal(norm(formatBand(RANKS[2].bandUsd, RANKS[2].band, cop, es)), "≈ COP 82M–COP 328M/mes");
  assert.equal(norm(formatBand(RANKS[3].bandUsd, RANKS[3].band, cop, es)), "≈ COP 328M–COP 1 mil M/mes");
  assert.equal(norm(formatBand(RANKS[5].bandUsd, RANKS[5].band, cop, es)), "≈ COP 4.1 mil M+/mes");
  const idr = { code: "IDR", rate: 16000, locale: "en" as const };
  assert.equal(norm(formatBand(RANKS[5].bandUsd, RANKS[5].band, idr, en)), "≈ IDR 16B+/mo");
  for (const r of RANKS) {
    for (const ctx of [cop, idr, mxn, mxnEs]) {
      const s = formatBand(r.bandUsd, r.band, ctx, ctx.locale === "es" ? es : en);
      assert.doesNotMatch(s, /\d\.\d\d|\d{4,}|[0-9] K\b|\dK\b/, `${ctx.code} ${r.key}: ${s}`);
    }
  }
});
