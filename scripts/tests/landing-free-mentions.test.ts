import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";

/**
 * Brief oct-2026 §LP: the home stops selling itself as "free". The word survives in exactly the places that
 * are facts, not slogans — the plan NAME in the pricing table, the price cells of the comparison table, and
 * the FAQ question "Is there a free plan?" (that one lives in app/page.tsx, outside these namespaces).
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const HOME_NAMESPACES = ["nav", "hero", "twoPaths", "compare", "footer", "pricing", "social", "analyzerDemo", "metaPromo"] as const;

/** `namespace.key` -> why the word is allowed there. */
const ALLOWED: Record<string, string> = {
  "pricing.priceFree": "name of the Free plan in the pricing table",
  "compare.cellPriceEv": "factual price cell: the Free plan / $19",
  "compare.cellPriceAudit": "factual price cell of the other audit tools",
};

const FREE = /\b(free|gratis)\b/i;

function offenders(locale: "en" | "es"): string[] {
  const dict = messages[locale] as unknown as Record<string, Record<string, unknown>>;
  const out: string[] = [];
  for (const ns of HOME_NAMESPACES) {
    for (const [k, v] of Object.entries(dict[ns] ?? {})) {
      if (typeof v === "string" && FREE.test(v) && !ALLOWED[`${ns}.${k}`]) out.push(`${locale}:${ns}.${k} = ${v.slice(0, 70)}`);
    }
  }
  const ui = JSON.parse(read(`lib/i18n/dict/ui-${locale}.json`)) as Record<string, Record<string, string>>;
  for (const [k, v] of Object.entries(ui.collage ?? {})) if (FREE.test(v)) out.push(`${locale}:collage.${k} = ${v.slice(0, 70)}`);
  return out;
}

test("home copy (EN + ES): 'free' / 'gratis' only appears in the allow-listed fact cells", () => {
  assert.deepEqual(offenders("en"), []);
  assert.deepEqual(offenders("es"), []);
});

test("the ONE trial signal of the home is the quiet microcopy next to the CTA, and it does not use the word", () => {
  assert.equal(messages.en.hero.anonMicro, "No card needed for your first audit");
  assert.equal(messages.es.hero.anonMicro, "Sin tarjeta para tu primera auditoría");
  assert.equal(messages.en.hero.trust.includes("card"), false, "the card promise is not repeated in the trust line");
});

test("the $1,500 slogan is gone in EN and ES, everywhere user-facing", () => {
  for (const locale of ["en", "es"] as const) {
    const all = JSON.stringify(messages[locale]) + read(`lib/i18n/dict/ui-${locale}.json`);
    assert.doesNotMatch(all, /1,500 of CRO|consultoría CRO de \$1,500/);
  }
  assert.equal(messages.en.analyzerDemo.heading, "Secure your store's place in its market.");
  assert.equal(messages.es.analyzerDemo.heading, "Asegura el lugar de tu tienda en su mercado.");
});

test("the home keeps 'store audit' in the H1 and the title, without the leading 'Free'", () => {
  assert.equal(messages.en.hero.line1, "Shopify store audit");
  assert.equal(messages.en.hero.line2, "See who's ahead of you and why.");
  assert.doesNotMatch(`${messages.en.hero.line1}${messages.en.hero.line2}${messages.es.hero.line1}${messages.es.hero.line2}`, /[—–]/, "no dash in the H1");
  assert.match(`${messages.es.hero.line1} ${messages.es.hero.line2}`, /Auditoría de tu tienda Shopify/);
  const page = read("app/page.tsx");
  assert.match(page, /absolute: "Shopify Store Analyzer & Store Audit \| EliteVault"/);
  assert.doesNotMatch(page.slice(0, page.indexOf("export default")), /\bFree\b(?! plan)/, "no 'Free' in the home metadata");
});

test("the Free plan name and the FAQ question 'Is there a free plan?' stay", () => {
  assert.equal(messages.en.pricing.priceFree, "Free");
  assert.match(read("app/page.tsx"), /question: "Is there a free plan\?"/);
});

test("the diagram shows the report v2: no 0-100 score; a competitor card with a Pro chip and two stores side by side with generic icons", () => {
  const collage = read("components/marketing/analyzer-collage.tsx");
  assert.doesNotMatch(collage, /\/100|collage\.overall|reportV2|collage\.topFixes/);
  assert.match(collage, /collage\.compTitle/);
  assert.match(collage, /collage\.compPro/);
  assert.match(collage, /collage\.compYou/);
  assert.match(collage, /collage\.compTop/);
  assert.match(collage, /<svg viewBox="0 0 100 44"/, "inline SVG mini charts");
  assert.match(collage, /<Store className/, "a generic store icon");
  assert.doesNotMatch(collage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, ""), /shopify|logo|<img|<Image/i,"no brand logo anywhere in the diagram (trademark / App Store risk)");
  const en = JSON.parse(read("lib/i18n/dict/ui-en.json")).collage as Record<string, string>;
  const es = JSON.parse(read("lib/i18n/dict/ui-es.json")).collage as Record<string, string>;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort(), "EN and ES collage keys match");
  for (const k of ["compTitle", "compYou", "compTop"]) assert.ok(en[k] && es[k], k);
  assert.equal(en.compYou, "Your store");
  assert.match(read("components/marketing/analyzer-demo.tsx"), /<AnalyzerCollage \/>/);
});

test("the pricing section's pill and the Free plan tagline are not 'free' slogans either (the plan NAME and its factual feature list stay)", () => {
  for (const locale of ["en", "es"] as const) {
    const ui = JSON.parse(read(`lib/i18n/dict/ui-${locale}.json`)) as { pills: Record<string, string>; plans: { free: { tagline: string } } };
    for (const [k, v] of Object.entries(ui.pills)) assert.doesNotMatch(v, FREE, `${locale}:pills.${k}`);
    assert.doesNotMatch(ui.plans.free.tagline, FREE, `${locale}:plans.free.tagline`);
  }
});
