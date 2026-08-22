import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBlocksUrl } from "../../lib/blocks/entry-gate";

/**
 * WP-A — the gate every Blocks submission passes before anything is spent.
 *
 * Three existing guards, in the one order that costs nothing when the answer is
 * "no": the SSRF check (lib/security/url-guard.ts, untouched), then the
 * page-kind classifier (lib/analyzer/page-kind.ts, untouched), then the
 * Shopify-shape parse. Each is a pure string check, so a homepage URL is
 * refused in microseconds — no credit, no Inngest event, no browser launch.
 *
 * The Analyzer learned this the expensive way: it used to accept anything
 * matching `min(3)`, charge for it, and spend ~200s failing through the capture
 * chain before refunding. Blocks starts with the gate already in place.
 *
 * Every rejection carries a CODE as well as prose. The UI needs to react
 * differently to "that's a collection page" (fixable by the user, show an
 * example) than to "we only do Shopify" (not fixable, don't imply it is).
 */

test("a Shopify product URL passes and carries its parsed identity", () => {
  const res = evaluateBlocksUrl("https://acme.com/products/beveled-ring");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.url, "https://acme.com/products/beveled-ring");
  assert.equal(res.ref.handle, "beveled-ring");
  assert.equal(res.ref.productJsUrl, "https://acme.com/products/beveled-ring.js");
});

test("a bare domain is accepted as input and normalized before classification", () => {
  // The guard adds the scheme. Without that, `acme.com/products/x` would be
  // unparseable and get refused as invalid rather than recognised.
  const res = evaluateBlocksUrl("acme.com/products/beveled-ring");
  assert.equal(res.ok, true);
});

test("the homepage is refused as NOT_PRODUCT with an example to copy", () => {
  const res = evaluateBlocksUrl("https://acme.com");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "NOT_PRODUCT");
  assert.match(res.error, /product page/i);
  assert.match(res.error, /\/products\//, "the message should show the shape we want");
});

test("a collection page is refused as NOT_PRODUCT, not as a bad URL", () => {
  const res = evaluateBlocksUrl("https://acme.com/collections/summer");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "NOT_PRODUCT");
});

test("a non-Shopify product page is refused honestly, as a platform limit", () => {
  // classifyPageKind correctly calls this a product. We still can't serve it,
  // and saying "that's not a product page" would send the user to fix a URL
  // that was already right.
  const res = evaluateBlocksUrl("https://acme.com/product/blue-widget");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "NOT_SHOPIFY");
  assert.match(res.error, /shopify/i);
});

test("SSRF-shaped input is refused before any other question is asked", () => {
  for (const url of [
    "http://localhost/products/x",
    "http://169.254.169.254/products/x",
    "http://192.168.1.1/products/x",
    "javascript:alert(1)",
    "",
  ]) {
    const res = evaluateBlocksUrl(url);
    assert.equal(res.ok, false, url);
    if (res.ok) continue;
    assert.equal(res.code, "INVALID_URL", url);
  }
});

test("the guard's own wording is passed through rather than replaced", () => {
  // The URL guard writes user-facing prose for each rejection reason. Rewriting
  // it here would give the same failure two different explanations depending on
  // which entry point the user came through.
  const res = evaluateBlocksUrl("http://localhost/products/x");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /can't be audited|local addresses/i);
});
