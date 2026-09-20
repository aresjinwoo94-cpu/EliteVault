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
    /absolute:\s*\n?\s*"Shopify Store Analyzer — Find What's Costing You Sales \| EliteVault"/,
  );
  assert.match(metadataBlock, /"Free AI Shopify store analyzer\./);
  // First keyword wins the most weight; it must be the target.
  const keywords = metadataBlock.match(/keywords:\s*\[([\s\S]*?)\]/);
  assert.ok(keywords, "keywords array");
  const first = keywords![1].split(",")[0].trim().replace(/"/g, "");
  assert.equal(first, KEYWORD);
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
  assert.equal(`${en.hero.line1} ${en.hero.line2}`, "Find what's costing your Shopify store sales.");
  assert.match(`${es.hero.line1} ${es.hero.line2}`, /tienda Shopify\.$/);
  assert.match(en.hero.subPre + en.hero.subHighlight, /before you scale traffic — see the exact leaks, ranked by impact/);
  assert.match(es.hero.subPre + es.hero.subHighlight, /antes de escalar tráfico — mira las fugas exactas, ordenadas por impacto/);

  assert.equal(en.socialStrip.b1Title, "Find your highest-impact fixes");
  assert.equal(es.socialStrip.b1Title, "Encuentra tus arreglos de mayor impacto");

  // Audience is defined by ad spend now, not by team size.
  assert.match(en.whoFor.body, /ecommerce owners already investing in acquisition/);
  assert.match(es.whoFor.body, /ya invierten en adquisición/);
  for (const [locale, ns] of [["en", en], ["es", es]] as const) {
    assert.doesNotMatch(ns.whoFor.heading + ns.whoFor.body, /solo founders|en solitario/i, locale);
  }
});
