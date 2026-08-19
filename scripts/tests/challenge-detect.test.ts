import { test } from "node:test";
import assert from "node:assert/strict";
import { detectChallenge, isRefusedStatus } from "../../lib/analyzer/challenge-detect";

/**
 * WP-A layer 1. Two failure modes, and they are NOT equally bad:
 *
 *  - a MISS means we audit a security page as if it were the store, which is
 *    what produced invented findings on brilliantearth.com;
 *  - a FALSE POSITIVE means we refuse to audit a store we could actually see,
 *    which is worse — it breaks a working product for a paying user.
 *
 * So the strong signatures are vendor infrastructure that never ships on a
 * storefront, and the captcha signatures only count on an otherwise-empty page.
 */

const CLOUDFLARE_INTERSTITIAL = `<!DOCTYPE html><html><head>
<title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>
</head><body><div class="cf-browser-verification cf-im-under-attack">
<h1>Checking your browser before accessing brilliantearth.com</h1>
<p>This process is automatic.</p></div></body></html>`;

const REAL_STORE = `<!DOCTYPE html><html><head><title>Acme — Handmade Rings</title></head>
<body><nav>Shop Collections About Contact</nav>
<h1>Handmade rings, built to last a lifetime</h1>
<p>${"Every ring is forged by hand in our Oakland workshop from recycled gold. ".repeat(20)}</p>
<button>Add to cart</button><footer>Free shipping over $50 · 30-day returns</footer>
</body></html>`;

test("a Cloudflare interstitial is detected and attributed", () => {
  const r = detectChallenge(CLOUDFLARE_INTERSTITIAL);
  assert.equal(r.detected, true);
  assert.equal(r.vendor, "Cloudflare");
});

test("each vendor's own signature is recognised", () => {
  const cases: [string, string][] = [
    ['<script>var _Incapsula_Resource="x"</script>', "Imperva Incapsula"],
    ['<div id="distil_r_captcha"></div>', "Distil"],
    ['<div id="px-captcha"></div>', "PerimeterX"],
    ['<script src="https://geo.captcha-delivery.com/captcha/"></script>', "DataDome"],
    ["<h1>Attention Required! | Cloudflare</h1>", "Cloudflare"],
    ["<p>__cf_chl_tk=abc</p>", "Cloudflare"],
  ];
  for (const [html, vendor] of cases) {
    const r = detectChallenge(html);
    assert.equal(r.detected, true, `missed: ${html.slice(0, 40)}`);
    assert.equal(r.vendor, vendor);
  }
});

test("an unattributed challenge is still detected", () => {
  // Generic wording used by several vendors — worth flagging even though we
  // can't name who is behind it.
  const r = detectChallenge("<h1>Performing security verification…</h1>");
  assert.equal(r.detected, true);
  assert.equal(r.vendor, null);
});

test("a real storefront is NOT flagged", () => {
  assert.deepEqual(detectChallenge(REAL_STORE), { detected: false, vendor: null });
});

test("Cloudflare's passive JS-detection script is NOT a challenge", () => {
  // Regression, found by verification against 20 live stores. With JS
  // Detections / Bot Fight Mode on, Cloudflare injects this into NORMALLY
  // SERVED 200 pages as fingerprinting — lush.com ships it with a complete
  // storefront. A bare `cdn-cgi/challenge-platform` match called that blocked,
  // which both blanked the model's site context and could replace the whole
  // report for a store we captured perfectly.
  const html = REAL_STORE.replace(
    "<nav>",
    `<script>var a=document.createElement('script');` +
      `a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';` +
      `document.getElementsByTagName('head')[0].appendChild(a);</script><nav>`,
  );
  assert.deepEqual(detectChallenge(html), { detected: false, vendor: null });
});

test("Cloudflare's real challenge orchestration IS a challenge", () => {
  // The other half of the same boundary — tightening the regex must not have
  // made it blind to the interstitial it exists for.
  const html =
    `<html><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>`;
  const r = detectChallenge(html);
  assert.equal(r.detected, true);
  assert.equal(r.vendor, "Cloudflare");
  // The 'g' variant ships too.
  assert.equal(
    detectChallenge('<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1">').detected,
    true,
  );
});

test("a thin but REAL storefront with a captcha is not flagged", () => {
  // us.oatly.com measured 721 visible characters — a real, heavily JS-rendered
  // store. The first threshold (1000) sat above it, so adding a captcha script
  // would have called it blocked. Live challenge pages measured ~58.
  const thinButReal = `<html><head><title>Oat — Shop</title></head><body>
    <nav>Shop About Stockists</nav>
    <h1>Oat drink, straight up</h1>
    <p>${"Brewed from whole oats and nothing weird. ".repeat(11)}</p>
    <div class="g-recaptcha"></div></body></html>`;
  assert.ok(
    thinButReal.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length > 400,
    "fixture should sit above the threshold, like the real store does",
  );
  assert.equal(detectChallenge(thinButReal).detected, false);
});

test("a store with a reCAPTCHA on its contact form is NOT flagged", () => {
  // THE false positive that matters. reCAPTCHA is on a huge share of normal
  // stores; treating it as conclusive would refuse to audit them.
  const html = REAL_STORE.replace(
    "<footer>",
    '<form><div class="g-recaptcha" data-sitekey="abc"></div></form><footer>',
  );
  assert.equal(detectChallenge(html).detected, false);
});

test("a captcha that IS the whole page is flagged", () => {
  const html = `<html><head><title>Verify</title></head><body>
    <div class="g-recaptcha" data-sitekey="abc"></div></body></html>`;
  const r = detectChallenge(html);
  assert.equal(r.detected, true);
  assert.equal(r.vendor, "reCAPTCHA");
});

test("hCaptcha gets the same thin-page treatment", () => {
  const alone = `<html><body><div class="h-captcha"></div></body></html>`;
  assert.equal(detectChallenge(alone).detected, true);
  const onAStore = REAL_STORE.replace("<footer>", '<div class="h-captcha"></div><footer>');
  assert.equal(detectChallenge(onAStore).detected, false);
});

test("script and style bulk don't make a challenge page look content-rich", () => {
  // A challenge page is mostly inline JS. If that counted as text, the thin-page
  // guard would never fire and the weak signatures would be dead code.
  const html = `<html><head><script>${"var x=1;".repeat(400)}</script>
    <style>${".a{color:red}".repeat(200)}</style></head>
    <body><div class="g-recaptcha"></div></body></html>`;
  assert.equal(detectChallenge(html).detected, true);
});

test("empty or junk input never claims a challenge", () => {
  assert.equal(detectChallenge("").detected, false);
  assert.equal(detectChallenge("   ").detected, false);
  assert.equal(detectChallenge("<html></html>").detected, false);
});

test("a refused status alone is never treated as a challenge", () => {
  // Plenty of healthy stores answer 403 to a bot user-agent while serving real
  // browsers — and the capture providers — perfectly well. Status only helps
  // attribute a challenge the HTML already proved.
  assert.equal(isRefusedStatus(403), true);
  assert.equal(isRefusedStatus(429), true);
  assert.equal(isRefusedStatus(503), true);
  assert.equal(isRefusedStatus(200), false);
  assert.equal(isRefusedStatus(404), false);
  // The important half: a 403 body that is a normal store is still not a challenge.
  assert.equal(detectChallenge(REAL_STORE).detected, false);
});
