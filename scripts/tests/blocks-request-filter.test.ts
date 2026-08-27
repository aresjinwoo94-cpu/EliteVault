import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldBlockRequest, __NOISY_DOMAINS } from "../../lib/blocks/request-filter";

/**
 * WP-F.5 — what the preview browser may skip, and what it must never skip.
 *
 * This filter is the one optimisation that can silently break the product. The
 * preview's whole claim is that it shows the merchant their OWN design; drop a
 * stylesheet or a font and it shows them a different one, faster, and nobody
 * finds out until a shopper sees a block in the wrong typeface.
 *
 * So the tests below are weighted the way the risk is: a handful confirm the
 * blocking works, and most of them confirm the ALLOWING does.
 */

const STORE = "https://acme-store.com";
const req = (url: string, resourceType: string, pageOrigin = STORE) =>
  shouldBlockRequest({ url, resourceType, pageOrigin });

test("stylesheets are never blocked, from anywhere", () => {
  // Every colour, font stack, radius and width we measure comes from CSS.
  // Shopify apps serve styles from their own CDNs, so "third-party" is not a
  // reason — not even for a host on the noisy list.
  for (const url of [
    "https://acme-store.com/assets/theme.css",
    "https://cdn.shopify.com/s/files/1/theme.css",
    "https://cdn.judge.me/widget.css",
    "https://static.klaviyo.com/onsite/styles.css",
  ]) {
    assert.equal(req(url, "stylesheet").block, false, url);
  }
});

test("web fonts are never blocked", () => {
  // A face that hasn't loaded reports the FALLBACK stack, so we'd calibrate
  // against a font the shopper never sees — and WP-B already waits on
  // document.fonts.ready precisely to avoid that.
  for (const url of [
    "https://fonts.gstatic.com/s/inter/v12/font.woff2",
    "https://cdn.shopify.com/s/files/1/fonts/custom.woff2",
    "https://acme-store.com/assets/brand.woff2",
  ]) {
    assert.equal(req(url, "font").block, false, url);
  }
});

test("anything on the store's own origin is allowed, whatever it is", () => {
  // The merchant's server is not where the bloat comes from — it IS where the
  // theme, its CSS and its buy box come from.
  for (const type of ["script", "xhr", "fetch", "image", "document", "other"]) {
    assert.equal(req(`${STORE}/anything.js`, type).block, false, type);
  }
  // Subdomains count as first-party too.
  assert.equal(req("https://cdn.acme-store.com/x.js", "script").block, false);
});

test("a store whose own domain contains a noisy name is not blocked", () => {
  // The failure this prevents: `matchesDomain` compares whole labels, so a
  // merchant at facebook-marketing-supplies.com keeps their own assets. A
  // substring test would have broken exactly the stores hardest to debug.
  const store = "https://facebook-marketing-supplies.com";
  assert.equal(
    req(`${store}/assets/theme.js`, "script", store).block,
    false,
    "the store's own domain was blocked as a tracker",
  );
  // And a lookalike third party is not accidentally trusted either.
  assert.equal(req("https://notfacebook.net/px.js", "script", store).block, false);
});

test("analytics, ad pixels, chat and review widgets are blocked", () => {
  for (const url of [
    "https://www.google-analytics.com/collect",
    "https://connect.facebook.net/en_US/fbevents.js",
    "https://static.hotjar.com/c/hotjar.js",
    "https://widget.intercom.io/widget/abc",
    "https://cdn.judge.me/loader.js",
    "https://static.klaviyo.com/onsite/js/klaviyo.js",
    "https://analytics.tiktok.com/i18n/pixel/events.js",
  ]) {
    assert.equal(req(url, "script").block, true, url);
  }
});

test("subdomains of a noisy domain are blocked; sibling domains are not", () => {
  assert.equal(req("https://ssl.google-analytics.com/ga.js", "script").block, true);
  assert.equal(req("https://mygoogle-analytics.com/x.js", "script").block, false);
});

test("media is always blocked — it cannot change a computed style", () => {
  for (const url of [`${STORE}/hero.mp4`, "https://cdn.shopify.com/v.webm"]) {
    assert.equal(req(url, "media").block, true, url);
  }
});

test("third-party images and scripts NOT on the list are allowed", () => {
  // The asymmetry that keeps the preview honest: when in doubt, allow. A
  // store's hero image can live on a CDN we've never heard of, and an app the
  // merchant pays for can inject visible content from anywhere.
  for (const [url, type] of [
    ["https://cdn.shopify.com/s/files/1/product.jpg", "image"],
    ["https://images.unknown-cdn.io/hero.webp", "image"],
    ["https://cdn.shopify.com/s/files/1/theme.js", "script"],
  ] as const) {
    assert.equal(req(url, type).block, false, url);
  }
});

test("inline and blob resources are left alone", () => {
  // Already in the page; blocking them saves nothing and can break rendering.
  assert.equal(req("data:image/svg+xml;base64,PHN2Zz4=", "image").block, false);
  assert.equal(req("blob:https://acme-store.com/abc", "script").block, false);
});

test("a malformed URL is allowed rather than guessed at", () => {
  assert.equal(req("not a url", "script").block, false);
  assert.equal(req("", "script").block, false);
});

test("the blocklist is domains, not substrings", () => {
  // Guards the guard: an entry with a path or a wildcard would silently behave
  // differently from every other entry.
  for (const d of __NOISY_DOMAINS) {
    assert.ok(!d.startsWith("."), `${d} starts with a dot`);
    assert.ok(!d.includes("*"), `${d} contains a wildcard`);
    assert.ok(d.includes("."), `${d} is not a domain`);
  }
});

test("a blocked verdict says why", () => {
  // The reason is what makes an over-blocking bug findable — otherwise a
  // missing stylesheet is just a preview that looks subtly wrong.
  const v = req("https://www.google-analytics.com/collect", "script");
  assert.equal(v.block, true);
  assert.match(v.reason ?? "", /domain:google-analytics\.com/);
  assert.match(req(`${STORE}/a.mp4`, "media").reason ?? "", /type:media/);
});
