import { test } from "node:test";
import assert from "node:assert/strict";
import { parseShopifyProductUrl } from "../../lib/blocks/product-url";

/**
 * WP-A — turning a pasted product URL into the two things Blocks needs: the
 * product HANDLE (persisted on the project row) and the public `.js` endpoint
 * that serves its real data.
 *
 * This is the gate that decides whether the feature can honour its own rule —
 * "no inventamos datos". If the handle is wrong we either 404 (honest) or, far
 * worse, fetch a DIFFERENT product and build a block full of confidently wrong
 * facts. So the parse is deliberately strict: only the shapes Shopify actually
 * serves count, and anything ambiguous returns null rather than a guess.
 *
 * `classifyPageKind` already answered "is this a product page?" upstream — it is
 * platform-agnostic on purpose (WooCommerce `/product/x` is a product too). This
 * is the narrower, Shopify-only question, which is why /product/ and /p/ fail
 * here even though they pass there.
 */

test("the canonical Shopify product path yields handle + .js endpoint", () => {
  assert.deepEqual(parseShopifyProductUrl("https://acme.com/products/blue-widget"), {
    handle: "blue-widget",
    productJsUrl: "https://acme.com/products/blue-widget.js",
  });
});

test("a product nested under a collection resolves to the same product", () => {
  // Shopify's other canonical shape. The collection is routing context, not
  // part of the product's identity, and `.js` is only served at the root path.
  assert.deepEqual(
    parseShopifyProductUrl("https://acme.com/collections/summer/products/blue-widget"),
    {
      handle: "blue-widget",
      productJsUrl: "https://acme.com/products/blue-widget.js",
    },
  );
});

test("a locale prefix is kept on the .js endpoint so Markets pricing stays true", () => {
  // /en-gb/products/x.js returns that market's price. Dropping the prefix would
  // quietly show a UK shopper the US price — an invented fact in a block whose
  // whole promise is that the numbers are real.
  assert.deepEqual(parseShopifyProductUrl("https://acme.com/en-gb/products/blue-widget"), {
    handle: "blue-widget",
    productJsUrl: "https://acme.com/en-gb/products/blue-widget.js",
  });
});

test("variant query strings and a trailing slash don't change the handle", () => {
  for (const url of [
    "https://acme.com/products/blue-widget?variant=4123",
    "https://acme.com/products/blue-widget/",
    "https://acme.com/products/blue-widget#reviews",
  ]) {
    assert.equal(parseShopifyProductUrl(url)?.handle, "blue-widget", url);
  }
});

test("the handle is normalized to the lowercase form Shopify serves", () => {
  assert.equal(
    parseShopifyProductUrl("https://acme.com/products/Blue-Widget")?.handle,
    "blue-widget",
  );
});

test("non-Shopify product paths are refused rather than guessed at", () => {
  // These ARE product pages (classifyPageKind says so) but they're WooCommerce /
  // Magento / generic shapes with no `.js` endpoint behind them. Guessing would
  // 404 at best; the caller needs to say "Shopify only, for now" instead.
  for (const url of [
    "https://acme.com/product/blue-widget",
    "https://acme.com/p/blue-widget",
    "https://acme.com/shop/blue-widget",
    "https://acme.com/catalog/product/view/id/42",
  ]) {
    assert.equal(parseShopifyProductUrl(url), null, url);
  }
});

test("pages that aren't a single product are refused", () => {
  for (const url of [
    "https://acme.com",
    "https://acme.com/collections/summer",
    "https://acme.com/products",
    "https://acme.com/pages/about",
  ]) {
    assert.equal(parseShopifyProductUrl(url), null, url);
  }
});

test("a handle that is only punctuation is not a handle", () => {
  // `/products/-` and friends parse structurally but can't identify anything.
  for (const url of ["https://acme.com/products/-", "https://acme.com/products/%20"]) {
    assert.equal(parseShopifyProductUrl(url), null, url);
  }
});

test("garbage input returns null instead of throwing", () => {
  for (const url of ["", "not a url", "javascript:alert(1)"]) {
    assert.equal(parseShopifyProductUrl(url), null, JSON.stringify(url));
  }
});
