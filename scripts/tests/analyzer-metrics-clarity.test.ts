import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";
import { bandOfHundred, rangeText } from "../../lib/analyzer/band-copy";

/** Brief oct-2026 "analyzer metrics clarity": presentation only — the numbers are untouched. */
const ROOT = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const run = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["tsx", "--tsconfig", "scripts/tests/tsconfig.json", "scripts/tests/helpers/render-metrics-clarity.mts"],
  { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
);
const raw = run.stdout.split("@@JSON@@")[1];
if (!raw) throw new Error(`render helper failed (status ${run.status}): ${run.stderr.slice(0, 800)}`);
const HTML = JSON.parse(raw) as Record<string, string>;
const text = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ");

type G = Record<string, string>;
type O = Record<string, string>;

test("band to 'of 100' is an honest rounding", () => {
  assert.deepEqual(bandOfHundred(0.013, 0.019), { kind: "range", lo: 1, hi: 2 });
  assert.equal(rangeText({ kind: "range", lo: 3, hi: 3 }), "3");
  assert.equal(rangeText({ kind: "range", lo: 1, hi: 2 }), "1–2");
  assert.deepEqual(bandOfHundred(0.001, 0.004), { kind: "lessThanOne" });
  assert.deepEqual(bandOfHundred(0.002, 0.021), { kind: "upTo", hi: 2 });
});

for (const locale of ["en", "es"] as const) {
  const m = messages[locale] as unknown as { gauges: G; optimizer: O };

  test(`[${locale}] gauges: Meta scenarios first (worst to best), organic last under a Reference divider, "of 100" readings, not-ROAS note`, () => {
    const h = HTML[`${locale}:gauges`];
    const t = text(h);
    const order = [m.gauges.metaBad, m.gauges.metaRegular, m.gauges.metaGood, m.gauges.reference, m.gauges.organic].map((s) => t.indexOf(s));
    assert.ok(order.every((i) => i >= 0), `all labels present: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, "order");
    assert.ok(t.includes(m.gauges.title) && t.includes(m.gauges.subtitle));
    assert.ok(t.includes(m.gauges.organicNote));
    assert.ok(t.includes(m.gauges.note) && /ROAS/.test(m.gauges.note));
    assert.equal((h.match(/data-scenario=/g) ?? []).length, 4);
    assert.ok(h.indexOf('data-scenario="organic"') > h.indexOf('data-scenario="meta_ads_good"'));
    assert.match(t, locale === "en" ? /≈ [\d–]+ of 100/ : /≈ [\d–]+ de 100/);
    assert.match(t, /\d+(\.\d)?–\d+(\.\d)?%/, "the band format is unchanged");
  });

  test(`[${locale}] optimizer: 5 clear names + the acronym, a plain line, a direction and typical-in-your-niche`, () => {
    const h = HTML[`${locale}:optimizer`];
    const t = text(h);
    assert.equal((h.match(/data-metric=/g) ?? []).length, 5);
    for (const k of ["maxBid", "costK", "ctr", "lpConv", "targetReturn", "cpcLine", "cpmLine", "ctrLine", "cvrLine", "nicheMedian", "targetsHeading", "marginNote"]) {
      assert.ok(t.includes(m.optimizer[k]), `${locale}.${k}`);
    }
    for (const a of ["CPC", "CPM", "CTR", "CVR", "ROAS"]) assert.ok(t.includes(a));
    assert.equal((t.match(new RegExp(`↓ ${m.optimizer.lowerBetter}`, "g")) ?? []).length, 2, "CPC and CPM: lower");
    assert.equal((t.match(new RegExp(`↑ ${m.optimizer.higherBetter}`, "g")) ?? []).length, 3, "CTR, CVR, ROAS: higher");
    // the ROAS line is filled with the REAL target (1.6x gives $1.60) and the values themselves are unchanged
    assert.ok(t.includes(m.optimizer.roasLine.replace("{x}", "1.6").replace("{usd}", "1.60")));
    assert.ok(t.includes("1.6x") && t.includes("$1.20") && t.includes("1.50%") && t.includes("2.10%"));
    assert.ok(!t.includes("{x}") && !t.includes("{usd}"));
  });

  test(`[${locale}] the locked preview uses the same clear names`, () => {
    const t = text(HTML[`${locale}:locked`]);
    for (const k of ["maxBid", "costK", "ctr", "lpConv", "targetReturn"]) assert.ok(t.includes(m.optimizer[k]), k);
  });
}

test("no top-buyer / bad-creative wording left in the UI copy (EN + ES)", () => {
  for (const f of ["lib/i18n/messages.ts", "lib/i18n/dict/ui-en.json", "lib/i18n/dict/ui-es.json", "components/analyzer/conversion-gauges.tsx"]) {
    assert.doesNotMatch(read(f), /top buyer|bad creative|mejor media buyer|creatividad mala/i, f);
  }
});

test("presentation only: numbers still come from the untouched engine, no AI call, no network", () => {
  assert.match(read("components/analyzer/conversion-gauges.tsx"), /conversionScenarioBands\(score, niche\)/);
  const src = read("components/analyzer/meta-ads-optimizer.tsx");
  assert.match(src, /tg\.cpc\.toFixed\(2\)/);
  assert.doesNotMatch(src + read("components/analyzer/conversion-gauges.tsx") + read("lib/analyzer/band-copy.ts"), /generate\(|gemini|fetch\(/i);
});

test("EN/ES parity of the gauges and optimizer keys", () => {
  const en = messages.en as unknown as { gauges: G; optimizer: O };
  const es = messages.es as unknown as { gauges: G; optimizer: O };
  assert.deepEqual(Object.keys(en.gauges).sort(), Object.keys(es.gauges).sort());
  assert.deepEqual(Object.keys(en.optimizer).sort(), Object.keys(es.optimizer).sort());
});
