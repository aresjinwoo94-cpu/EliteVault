import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShopifyProductJson } from "../../lib/blocks/product-json";

/**
 * WP-A — normalizing what `/products/<handle>.js` returns.
 *
 * This is the ONLY source of product facts in the feature, so its failure mode
 * matters more than its success one. The rule the brief sets is that a block
 * with claims never gets autofilled with invented data; the way that rule is
 * kept HERE is by returning null the moment the payload isn't recognisably a
 * Shopify product, instead of coercing an empty object into a product with a
 * blank title and a $0.00 price.
 *
 * Prices arrive as integer CENTS and stay integer cents all the way through.
 * Dividing by 100 into a float here is how a $39.90 product becomes $39.900000
 * three layers later.
 */

/** A trimmed-but-real /products/x.js payload. */
const SHOPIFY_JS = {
  id: 7891234567,
  title: "Beveled Signet Ring",
  handle: "beveled-signet-ring",
  description: "<p>Solid brass, hand-finished.</p>",
  published_at: "2024-02-01T10:00:00-05:00",
  vendor: "Acme Jewelry",
  type: "Rings",
  price: 8900,
  price_min: 8900,
  price_max: 12900,
  available: true,
  compare_at_price: 12000,
  featured_image: "//cdn.shopify.com/s/files/1/ring.jpg",
  images: ["//cdn.shopify.com/s/files/1/ring.jpg", "//cdn.shopify.com/s/files/1/ring-2.jpg"],
  variants: [
    { id: 1, title: "Size 7", price: 8900, available: true },
    { id: 2, title: "Size 9", price: 12900, available: false },
  ],
};

test("a real product payload keeps its title, handle, vendor and cent-priced amounts", () => {
  const p = parseShopifyProductJson(SHOPIFY_JS);
  assert.ok(p);
  assert.equal(p.title, "Beveled Signet Ring");
  assert.equal(p.handle, "beveled-signet-ring");
  assert.equal(p.vendor, "Acme Jewelry");
  assert.equal(p.priceCents, 8900);
  assert.equal(p.compareAtCents, 12000);
  assert.equal(p.available, true);
});

test("protocol-relative CDN images are resolved to https so they render off-store", () => {
  // Shopify serves `//cdn.shopify.com/…`. Injected into our preview page that
  // resolves fine, but persisted and re-rendered anywhere else it's a dead link.
  const p = parseShopifyProductJson(SHOPIFY_JS);
  assert.deepEqual(p?.images, [
    "https://cdn.shopify.com/s/files/1/ring.jpg",
    "https://cdn.shopify.com/s/files/1/ring-2.jpg",
  ]);
  assert.equal(p?.featuredImage, "https://cdn.shopify.com/s/files/1/ring.jpg");
});

test("variants keep their own prices in cents", () => {
  const p = parseShopifyProductJson(SHOPIFY_JS);
  assert.deepEqual(p?.variants, [
    { title: "Size 7", priceCents: 8900, available: true },
    { title: "Size 9", priceCents: 12900, available: false },
  ]);
});

test("a product with no compare-at price reports null, not zero", () => {
  // 0 would render as a struck-through "$0.00" next to the real price — an
  // invented discount, which is exactly the class of claim this feature bans.
  const p = parseShopifyProductJson({ ...SHOPIFY_JS, compare_at_price: null });
  assert.equal(p?.compareAtCents, null);
});

test("a compare-at price at or below the real price is dropped", () => {
  // Shopify leaves stale compare_at values behind after a price change. Showing
  // "was $89, now $89" is a fake discount.
  for (const stale of [8900, 5000]) {
    const p = parseShopifyProductJson({ ...SHOPIFY_JS, compare_at_price: stale });
    assert.equal(p?.compareAtCents, null, `compare_at=${stale}`);
  }
});

test("payloads that aren't a Shopify product return null", () => {
  for (const bad of [
    null,
    undefined,
    "<!doctype html>", // the store 404'd and served its HTML page
    {},
    { title: "No price here" },
    { price: 8900 }, // no title
    { title: "", price: 8900 }, // blank title
    { title: "Ghost", price: "8900" }, // price must be a number of cents
    [],
  ]) {
    assert.equal(parseShopifyProductJson(bad), null, JSON.stringify(bad));
  }
});

test("a negative price is refused", () => {
  assert.equal(parseShopifyProductJson({ ...SHOPIFY_JS, price: -1 }), null);
});

test("a free product is a real product", () => {
  // price 0 is legitimate (samples, gift-with-purchase) and must not be
  // confused with "no price found".
  assert.equal(parseShopifyProductJson({ ...SHOPIFY_JS, price: 0 })?.priceCents, 0);
});

test("the description keeps its HTML but is capped so one product can't blow the row", () => {
  const long = { ...SHOPIFY_JS, description: "<p>" + "x".repeat(50_000) + "</p>" };
  const p = parseShopifyProductJson(long);
  assert.ok(p);
  assert.ok(
    p.descriptionHtml.length <= 8_000,
    `description was ${p.descriptionHtml.length} chars`,
  );
});

test("the image list is capped", () => {
  const many = { ...SHOPIFY_JS, images: Array.from({ length: 40 }, (_, i) => `https://c/${i}.jpg`) };
  assert.ok((parseShopifyProductJson(many)?.images.length ?? 99) <= 10);
});

test("a missing image list is an empty list, not a crash", () => {
  const p = parseShopifyProductJson({ ...SHOPIFY_JS, images: undefined, featured_image: undefined });
  assert.deepEqual(p?.images, []);
  assert.equal(p?.featuredImage, null);
});
