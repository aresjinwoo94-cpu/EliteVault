import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBrand } from "../../lib/library/store-check";

const pad = " ".repeat(600);

test("a brand known by two names matches either (Athletic Greens (AG1)); the wrong domain still fails", () => {
  assert.equal(matchBrand(`<title>AG1 Official | More Than A Greens Powder</title>${pad}`, "Athletic Greens (AG1)", "athleticgreens.com").match, true);
  assert.equal(matchBrand(`<title>Official Athletics Website | MLB.com</title>${pad}`, "Athletic Greens (AG1)", "athletics.com").match, false);
});

test("every brand word in the page title is enough (Sundays for Dogs ⊂ Sundays Food for Dogs)", () => {
  assert.equal(matchBrand(`<title>Air-Dried Dog Food Delivery | Sundays Food for Dogs</title>${pad}`, "Sundays for Dogs", "sundaysfordogs.com").match, true);
});

import { analyzeHome, countCategoryLinks, type HomeFetch } from "../../lib/library/store-check";
import { judgeStore } from "../../lib/library/quality";
import { signalTier } from "../../lib/library/ad-signal";
import { GOOD_EVIDENCE } from "./helpers/evidence";

test("a custom storefront with category navigation (vrai.com) counts as having a catalogue", () => {
  const nav = ["jewelry", "diamonds", "engagement-rings", "wedding-bands", "necklaces", "earrings"].map((p) => `<a href="/${p}">x</a>`).join("");
  assert.ok(countCategoryLinks(nav) >= 5);
  const home: HomeFetch = { ok: true, status: 200, finalUrl: "https://vrai.com/", html: `<title>VRAI | Lab-grown diamond jewelry</title>${nav}${pad}`, headers: {} };
  assert.equal(analyzeHome(home, { title: "Vrai", domain: "vrai.com", niche: "accessories" }).productStore, true);
});

test("the owner's curated exception skips ONLY the catalogue check", () => {
  const base = { url: "https://s.com", domain: "s.com", title: "S", niche: "pet", isLive: true, thumbnailUrl: "https://x.supabase.co/a.jpg" };
  const noCatalogue = { ...GOOD_EVIDENCE, productStore: false };
  assert.equal(judgeStore({ ...base, evidence: noCatalogue }).status, "review");
  assert.equal(judgeStore({ ...base, evidence: noCatalogue, ownerCurated: true }).status, "published");
  // never a pass for the other checks
  assert.equal(judgeStore({ ...base, evidence: { ...noCatalogue, brandMatch: false, brandDetail: "x" }, ownerCurated: true }).status, "review");
  assert.equal(judgeStore({ ...base, evidence: { ...noCatalogue, reachable: false, status: 0 }, ownerCurated: true }).status, "review");
  assert.equal(signalTier({ active_ads_count: 5, ad_signals: { estimated: true }, added_by_ai: true, curated_override: true }), "curated");
});
