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

const HOME_NAMESPACES = ["nav", "hero", "twoPaths", "compare", "footer", "pricing", "social", "toolkit", "metaPromo"] as const;

/** `namespace.key` -> why the word is allowed there. */
const ALLOWED: Record<string, string> = {
  "toolkit.analyzerPill": "factual plan pill derived from PLANS: the Free plan includes the Analyzer",
  "toolkit.libraryPill": "factual plan pill derived from PLANS: the Free plan sees {n} stores in full",
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
  assert.equal(messages.en.toolkit.heading, "Three real tools. One place to hold your market.");
  assert.equal(messages.es.toolkit.heading, "Tres herramientas reales. Un solo lugar para asegurar tu mercado.");
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

test("the toolkit section: 3 own SVG diagrams, no third-party logos or images, one CTA that focuses the hero input", () => {
  const diagrams = read("components/marketing/toolkit-diagrams.tsx");
  assert.equal((diagrams.match(/export function \w+Diagram\b/g) ?? []).length, 3, "Analyzer, Library, Simulator diagrams");
  assert.doesNotMatch(diagrams, /<image|<img|<Image|https?:\/\//, "diagrams are pure SVG shapes");
  const section = read("components/marketing/toolkit.tsx");
  assert.match(section, /id="analyzer"/);
  assert.doesNotMatch(section.replace(/\/\*[\s\S]*?\*\//g, ""), /<img|<Image|logo|Gemini|Anthropic|OpenAI|Meta Ad/i, "Built on is text only, no AI vendors");
  assert.match(read("components/marketing/toolkit-cta.tsx"), /data-audit-source="hero"/);
  assert.match(read("components/marketing/anon-audit-box.tsx"), /data-audit-source=\{source\}/);
});

test("the pricing section's pill and the Free plan tagline are not 'free' slogans either (the plan NAME and its factual feature list stay)", () => {
  for (const locale of ["en", "es"] as const) {
    const ui = JSON.parse(read(`lib/i18n/dict/ui-${locale}.json`)) as { pills: Record<string, string>; plans: { free: { tagline: string } } };
    for (const [k, v] of Object.entries(ui.pills)) assert.doesNotMatch(v, FREE, `${locale}:pills.${k}`);
    assert.doesNotMatch(ui.plans.free.tagline, FREE, `${locale}:plans.free.tagline`);
  }
});
