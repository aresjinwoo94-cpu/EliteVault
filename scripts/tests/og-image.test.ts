import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOgImage } from "../../lib/screenshot-core";

/**
 * og:image fallback parser (tech-fixes §3). When every headless capture
 * provider is blocked, we recover the store's social-share image. This locks
 * the extraction across the attribute-order and tag variants seen in the wild.
 */

test("extracts og:image with property-first attribute order", () => {
  const html = `<head><meta property="og:image" content="https://cdn.shop/hero.jpg"></head>`;
  assert.equal(extractOgImage(html), "https://cdn.shop/hero.jpg");
});

test("extracts og:image with content-first attribute order", () => {
  const html = `<meta content="https://cdn.shop/hero.png" property="og:image" />`;
  assert.equal(extractOgImage(html), "https://cdn.shop/hero.png");
});

test("prefers og:image:secure_url over the plain tag", () => {
  const html = `
    <meta property="og:image" content="http://cdn.shop/insecure.jpg">
    <meta property="og:image:secure_url" content="https://cdn.shop/secure.jpg">
  `;
  assert.equal(extractOgImage(html), "https://cdn.shop/secure.jpg");
});

test("falls back to twitter:image when no og:image", () => {
  const html = `<meta name="twitter:image" content="https://cdn.shop/tw.jpg">`;
  assert.equal(extractOgImage(html), "https://cdn.shop/tw.jpg");
});

test("accepts a relative image path (resolved by the caller)", () => {
  const html = `<meta property="og:image" content="/assets/og.png">`;
  assert.equal(extractOgImage(html), "/assets/og.png");
});

test("returns null when there is no share image", () => {
  assert.equal(extractOgImage(`<head><title>No og here</title></head>`), null);
  assert.equal(extractOgImage(``), null);
});

test("ignores a non-URL/garbage content value", () => {
  const html = `<meta property="og:image" content="{{ product.image }}">`;
  assert.equal(extractOgImage(html), null);
});
