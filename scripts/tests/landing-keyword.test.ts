import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messages } from "../../lib/i18n/messages";

/**
 * WP-D — the landing targets "shopify store analyzer".
 *
 * The page used to lead with Meta ads in its title, description and hero,
 * which both buried what the product IS and competed with the dedicated Meta
 * pages for their own keyword. These pin the repositioning: the keyword is
 * present where it counts, Meta ads is gone from those three places, and the
 * copy exists in BOTH locales (a half-translated hero is the usual way this
 * regresses).
 */

const ROOT = process.cwd();
const landing = readFileSync(resolve(ROOT, "app/page.tsx"), "utf8");
/** The metadata block only — comments and the rest of the file excluded. */
const metadataBlock = landing
  .slice(landing.indexOf("export const metadata"), landing.indexOf("export const dynamic"))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const KEYWORD = "shopify store analyzer";

test("the landing's title, description and keywords lead with the analyzer", () => {
  assert.match(
    metadataBlock,
    /absolute:\s*\n?\s*"Shopify Store Analyzer & Free Store Audit \| EliteVault"/,
  );
  assert.match(metadataBlock, /"Free AI Shopify store analyzer and store audit\./);
  // First keyword wins the most weight; it must be the target.
  const keywords = metadataBlock.match(/keywords:\s*\[([\s\S]*?)\]/);
  assert.ok(keywords, "keywords array");
  const first = keywords![1].split(",")[0].trim().replace(/"/g, "");
  assert.equal(first, KEYWORD);
});

test('"store audit" is in the <title>, og:title and twitter:title', () => {
  for (const m of metadataBlock.matchAll(/(?:absolute|title):\s*\n?\s*"([^"]+)"/g)) {
    assert.match(m[1], /store audit/i, `"${m[1]}" lost "store audit"`);
  }
});

test("Meta ads no longer leads the title, description or hero", () => {
  // The <title>, description and og/twitter strings, not the whole file: the
  // long-tail keyword "meta ads forecast" keeps its own dedicated page.
  for (const m of metadataBlock.matchAll(/(?:absolute|description|title):\s*\n?\s*"([^"]+)"/g)) {
    assert.doesNotMatch(m[1], /meta ads/i, `"${m[1]}" still leads with Meta ads`);
  }
  for (const locale of ["en", "es"] as const) {
    const hero = (messages[locale] as unknown as { hero: Record<string, string> }).hero;
    const line = `${hero.badge1} ${hero.line1} ${hero.line2} ${hero.subPre}${hero.subHighlight}${hero.subPost}`;
    assert.doesNotMatch(line, /meta ads|anuncios de meta/i, `[${locale}] hero still sells Meta ads`);
  }
  // The dedicated page still owns its keyword — this change must not have
  // gutted it.
  const metaPage = readFileSync(resolve(ROOT, "app/meta-ads-forecast/page.tsx"), "utf8");
  assert.match(metaPage, /"meta ads simulator"/);
});

// The first draft of this copy promised an audit of "homepage and product
// page". The analyzer reads ONE url (extra captures are off by default —
// ANALYZER_EXTRA_SHOTS = 0), and the report itself says "this reads one
// product page, not your whole store". Metadata is a promise made in search
// results, where nobody can see the caveat.
test("the metadata does not promise a multi-page audit", () => {
  for (const m of metadataBlock.matchAll(/(?:description):\s*\n?\s*"([^"]+)"/g)) {
    assert.doesNotMatch(
      m[1],
      /homepage and product page|whole store|every page|all your pages/i,
      `"${m[1]}" promises more than one page`,
    );
  }
});

test("only one of our pages targets the keyword", () => {
  // Two pages chasing one term splits the signal, which is the opposite of
  // the point of this change.
  const others = [
    "app/free-website-audit/page.tsx",
    "app/ai-buyer-persona-simulator/page.tsx",
    "app/meta-ads-forecast/page.tsx",
    "app/winning-shopify-stores/page.tsx",
  ];
  for (const f of others) {
    const src = readFileSync(resolve(ROOT, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.doesNotMatch(src, /"shopify store analyzer"/, `${f} also targets it`);
  }
});

test("the repositioned copy exists in both locales", () => {
  const en = messages.en as unknown as Record<string, Record<string, string>>;
  const es = messages.es as unknown as Record<string, Record<string, string>>;

  assert.match(en.hero.badge1, /shopify store analyzer/i);
  assert.match(es.hero.badge1, /analizador shopify/i);
  assert.equal(`${en.hero.line1} ${en.hero.line2}`, "Free Shopify store audit — find what's costing you sales.");
  assert.match(`${en.hero.line1} ${en.hero.line2}`, /store audit/i);
  assert.match(`${es.hero.line1} ${es.hero.line2}`, /tienda Shopify/);
  assert.match(en.hero.subPre + en.hero.subHighlight, /before you scale traffic — see the exact leaks, ranked by impact/);
  assert.match(es.hero.subPre + es.hero.subHighlight, /antes de escalar tráfico — mira las fugas exactas, ordenadas por impacto/);

  // Brief §2 — the strip promises what the Fix Tracks deliver (card 3 is untouched).
  assert.equal(en.socialStrip.eyebrow, "What you'll discover");
  assert.equal(es.socialStrip.eyebrow, "Aquí descubrirás");
  assert.equal(en.socialStrip.b1Title, "How to make more sales after the purchase");
  assert.equal(es.socialStrip.b1Title, "Cómo generar más ventas después de la compra");
  assert.equal(en.socialStrip.b2Title, "How to redesign your Shopify store the right way");
  assert.equal(es.socialStrip.b2Title, "Cómo rediseñar bien tu tienda Shopify");
  assert.equal(en.socialStrip.b3Title, "See every leak on the page");
  assert.equal(es.socialStrip.b3Title, "Mira cada fuga de la página");
  assert.equal(en.socialStrip.b3Sub, "Caught before they drain your ad budget.");
  assert.equal(es.socialStrip.b3Sub, "Detectadas antes de que drenen tu presupuesto.");
  assert.equal(en.socialStrip.b4Title, "How to win in your niche");
  assert.equal(es.socialStrip.b4Title, "Cómo triunfar en tu nicho");

  // Audience is defined by ad spend now, not by team size.
  assert.match(en.whoFor.body, /ecommerce owners already investing in acquisition/);
  assert.match(es.whoFor.body, /ya invierten en adquisición/);
  for (const [locale, ns] of [["en", en], ["es", es]] as const) {
    assert.doesNotMatch(ns.whoFor.heading + ns.whoFor.body, /solo founders|en solitario/i, locale);
  }
});
