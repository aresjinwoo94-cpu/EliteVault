import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeHome, brandKey, countProductLinks, detectShopify, evidenceFailures, evidenceIsFresh, looksLikeApp, matchBrand, matchNiche, type HomeFetch } from "../../lib/library/store-check";

/** WP-L2 — the analyzers behind "Shopify verified · domain = brand · sells products · fits the niche". */
const pad = " ".repeat(600);
const home = (html: string, over: Partial<HomeFetch> = {}): HomeFetch => ({ ok: true, status: 200, finalUrl: "https://x.com/", html: html + pad, headers: {}, ...over });

const SHOP = `<html><head><title>Dieux Skin – Skincare for the eyes</title><meta property="og:site_name" content="Dieux Skin">
<meta name="description" content="Serum, cleanser and moisturizer for your skin"><script src="https://cdn.shopify.com/s/files/1/x.js"></script><script>window.Shopify = {theme:{}};</script></head>
<body><a href="/products/forever-eye-mask">Mask</a><a href="/products/serum">Serum</a><a href="/collections/all">All</a><a href="/products/cream">Cream</a><p>Shop skin care: serum, cleanser, moisturizer</p></body></html>`;

test("brandKey normalizes names", () => {
  assert.equal(brandKey("MVMT | Watches, Sunglasses & Accessories"), "mvmt");
  assert.equal(brandKey("The Ordinary"), "ordinary");
  assert.equal(brandKey("Care/of"), "careof");
});

test("a real Shopify skincare store passes every check", () => {
  const ev = analyzeHome(home(SHOP), { title: "Dieux Skin", domain: "dieuxskin.com", niche: "skincare" });
  assert.deepEqual(evidenceFailures(ev), []);
  assert.equal(ev.shopify, true);
  assert.ok(ev.productLinks >= 3);
});

test("Shopify detection: one stray cdn asset is not enough; /cart.js JSON or theme object is", () => {
  assert.equal(detectShopify({ html: '<img src="https://cdn.shopify.com/a.png">', headers: {} }).shopify, false);
  assert.equal(detectShopify({ html: "<html></html>", headers: {}, cartJson: true }).shopify, true);
  assert.equal(detectShopify({ html: "window.Shopify = {}", headers: {} }).shopify, true);
  assert.equal(detectShopify({ html: "<html></html>", headers: { "x-shopid": "123" } }).shopify, true);
});

test("a wrong domain is caught (bala.com is a university, the saved brand is a fitness brand)", () => {
  const uni = `<title>BALA Engineering – Advancing Sustainability</title><meta property="og:site_name" content="Bala Engineering">`;
  const m = matchBrand(uni + pad, "Bala", "bala.com");
  // the brand token "bala" IS in the title, so brand matching alone cannot catch this — the niche/product checks do
  assert.equal(m.match, true);
  const ev = analyzeHome(home(`<html><head>${uni}<meta name="description" content="Engineering and campus planning services"></head><body>Our campus projects</body></html>`), { title: "Bala", domain: "bala.com", niche: "fitness" });
  assert.ok(evidenceFailures(ev).some((f) => /Shopify|catalogue|niche/i.test(f)), JSON.stringify(evidenceFailures(ev)));
  const athletic = matchBrand(`<title>Athletics Direct – shoes</title>${pad}`, "Athletic Greens (AG1)", "athleticgreens.com");
  assert.equal(athletic.match, false);
});

test("an app / service (Calm) is flagged: no catalogue + app-store language", () => {
  const calm = `<title>Calm – Sleep, Meditation and Relaxation</title><p>Download the app on the App Store and Google Play. Start your free trial. Guided meditation.</p>`;
  assert.equal(looksLikeApp(calm + pad, 0), true);
  const ev = analyzeHome(home(calm), { title: "Calm", domain: "calm.com", niche: "wellness" });
  assert.ok(evidenceFailures(ev).includes("looks like an app / service, not a store"));
  assert.ok(evidenceFailures(ev).includes("not verified as a Shopify store"));
});

test("product links are counted once each; niche needs two keyword hits", () => {
  assert.equal(countProductLinks('<a href="/products/a">1</a><a href="/products/a">1</a><a href="/collections/b">2</a>'), 2);
  assert.equal(matchNiche("<title>Mattresses and sleep</title>" + pad, "wellness").fit, false);
  assert.equal(matchNiche("<title>Vitamins and sleep supplements</title>" + pad, "wellness").fit, true);
  assert.equal(matchNiche("<title>x</title>", "unknown-niche").fit, false);
});

test("unreachable home fails closed; evidence freshness", () => {
  const ev = analyzeHome({ ok: false, status: 403, finalUrl: "", html: "", headers: {} }, { title: "Crocs", domain: "crocs.com", niche: "footwear" });
  assert.deepEqual(evidenceFailures(ev), ["home unreachable (HTTP 403)"]);
  assert.deepEqual(evidenceFailures(null), ["store not verified yet"]);
  assert.equal(evidenceIsFresh(ev), true);
  assert.equal(evidenceIsFresh({ ...ev, checkedAt: "2020-01-01T00:00:00Z" }), false);
});

test("escaped titles still match the brand (Rothy&#39;s, Harry&#x27;s, Fable &amp; Mane)", () => {
  assert.equal(matchBrand(`<title>Rothy&#39;s | Washable Shoes &amp; Bags</title>${pad}`, "Rothy's", "rothys.com").match, true);
  assert.equal(matchBrand(`<title>Harry&#x27;s | Quality Shaving</title>${pad}`, "Harry's", "harrys.com").match, true);
  assert.equal(matchBrand(`<title>Fable &amp; Mane | Hair</title>${pad}`, "Fable & Mane", "fableandmane.com").match, true);
});
