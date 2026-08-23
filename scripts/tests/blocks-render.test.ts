import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderBlock,
  BLOCK_PREFIX,
  selectorsOf,
} from "../../lib/blocks/render-block";
import { normalizeDesignTokens } from "../../lib/blocks/design-tokens";
import type { RawTokenSample } from "../../lib/blocks/design-tokens";
import type { BlocksProduct } from "../../lib/blocks/product-json";

/**
 * WP-B/WP-C — "it is impossible for this to break your theme".
 *
 * That promise is not a matter of care, it's a matter of SELECTORS. A block
 * that styles `img` or `.price` or `button` will silently restyle the store's
 * own elements the moment it's pasted in, and the merchant will discover it on
 * a live storefront. So every rule this module emits has to be reachable only
 * through the block's own prefix, and that's checked mechanically here rather
 * than trusted to review.
 *
 * The second half is escaping. Product titles and vendor names come from the
 * store, and the block is injected into a live page in WP-B and pasted into a
 * theme in WP-D — so a title containing `<script>` or `"` has to stay text in
 * both places.
 */

const RAW: RawTokenSample = {
  bodyBackground: "rgb(255, 255, 255)",
  bodyColor: "rgb(18, 18, 18)",
  bodyFontFamily: "Assistant, sans-serif",
  bodyFontSize: "16px",
  bodyFontWeight: "400",
  headingFontFamily: "'Playfair Display', serif",
  headingFontWeight: "700",
  headingColor: "rgb(18, 18, 18)",
  headingFontSize: "36px",
  buttonBackground: "rgb(18, 74, 61)",
  buttonColor: "rgb(255, 255, 255)",
  buttonBorderRadius: "8px",
  buttonBorderColor: "rgb(18, 74, 61)",
  containerMaxWidth: "1200px",
  cardShadow: "rgba(0, 0, 0, 0.08) 0px 2px 8px 0px",
  surfaceBackground: "rgb(246, 246, 246)",
};

const TOKENS = normalizeDesignTokens(RAW);

const PRODUCT: BlocksProduct = {
  title: "Beveled Signet Ring",
  handle: "beveled-signet-ring",
  vendor: "Acme Jewelry",
  productType: "Rings",
  priceCents: 8900,
  compareAtCents: 12000,
  available: true,
  descriptionHtml: "<p>Solid brass.</p>",
  featuredImage: "https://cdn.shopify.com/ring.jpg",
  images: ["https://cdn.shopify.com/ring.jpg"],
  variants: [
    { title: "Size 7", priceCents: 8900, available: true },
    { title: "Size 9", priceCents: 12900, available: false },
  ],
};

function render() {
  return renderBlock({
    spec: { type: "product_facts" },
    tokens: TOKENS,
    product: PRODUCT,
    currency: "USD",
  });
}

test("every selector the block emits is reachable only through its own prefix", () => {
  // The whole "can't break your theme" guarantee, checked rather than asserted.
  const selectors = selectorsOf(render().css);
  assert.ok(selectors.length > 0, "no selectors were found — the check is vacuous");
  for (const sel of selectors) {
    assert.ok(
      sel.startsWith(`.${BLOCK_PREFIX}`),
      `selector "${sel}" escapes the block — it would restyle the theme`,
    );
  }
});

test("the selectors a careless block would have used are absent", () => {
  // Named explicitly because these are the ones that actually cause damage on a
  // Shopify theme: they exist on every storefront.
  //
  // Checked against the PARSED selectors, not by regex over the raw text: an
  // earlier version of this test scanned the stylesheet as a string and flagged
  // `.ev-blk__media img`, which is a descendant of the block and therefore
  // exactly as contained as everything else. What matters is what a selector
  // STARTS with — a bare `img` restyles the storefront, a scoped one cannot.
  const selectors = selectorsOf(render().css);
  const dangerous = ["body", "html", "img", "button", "*", ".price", ".product", ":root", "a"];
  for (const sel of selectors) {
    const head = sel.split(/[\s>+~]/)[0];
    assert.ok(
      !dangerous.includes(head),
      `selector "${sel}" begins with the global "${head}" — it would restyle the theme`,
    );
  }
});

test("the block imports nothing and loads nothing from elsewhere", () => {
  // An @import would be a render-blocking request the merchant didn't agree to,
  // and a third party that can restyle their store later.
  const { css } = render();
  assert.ok(!/@import/i.test(css));
  assert.ok(!/url\s*\(\s*['"]?https?:/i.test(css));
});

test("design tokens become custom properties on the block root, not globally", () => {
  const { css } = render();
  assert.ok(css.includes(`.${BLOCK_PREFIX}{`) || css.includes(`.${BLOCK_PREFIX} {`));
  assert.ok(!css.includes(":root"), "custom properties must not be declared globally");
});

test("the store's measured colours are what actually style the block", () => {
  // The product's reason to exist. If the accent in the CSS isn't the accent we
  // measured off the buy button, nothing else matters.
  const { css } = render();
  assert.ok(css.includes("#124a3d"), "the measured accent is missing from the CSS");
  assert.ok(css.includes("#ffffff"), "the measured page background is missing");
  assert.ok(css.includes("Assistant"), "the measured body font is missing");
});

test("every surface the block paints can carry the block's text", () => {
  // The bug this exists to stop, found live: the contrast repair fixed the
  // PANEL and left the tiles inside it behind, because the tiles were painted
  // with the page background while the panel used the measured surface. On a
  // store where those two are opposites, the panel read 21:1 and the stat tiles
  // read 1.08 — "PRICE / 14.99" was invisible.
  //
  // Checked against the emitted CSS rather than the tokens, because the tokens
  // were individually fine. The pairing is what was wrong.
  const hostile = normalizeDesignTokens({
    ...RAW,
    bodyBackground: "rgb(246, 246, 246)",
    bodyColor: "rgb(17, 17, 17)",
    surfaceBackground: "rgb(0, 0, 0)",
  });
  const { css } = renderBlock({
    spec: { type: "product_facts" },
    tokens: hostile,
    product: PRODUCT,
    currency: "USD",
  });

  // Nothing inside the block may paint itself with the PAGE background — that
  // is the colour behind the block, not a colour the block's own text sits on.
  const inner = css
    .split("\n")
    .filter((line) => line.startsWith(`.${BLOCK_PREFIX}__`))
    .join("\n");
  assert.ok(
    !/background:\s*var\(--ev-bg\)/.test(inner),
    "an inner element paints itself with the page background:\n" + inner,
  );
});

test("a store with square corners gets square corners", () => {
  const square = normalizeDesignTokens({ ...RAW, buttonBorderRadius: "0px" });
  const { css } = renderBlock({
    spec: { type: "product_facts" },
    tokens: square,
    product: PRODUCT,
    currency: "USD",
  });
  assert.ok(/--ev-radius:\s*0px/.test(css), css.slice(0, 300));
});

test("product text is escaped, so a hostile title stays text", () => {
  const { html } = renderBlock({
    spec: { type: "product_facts" },
    tokens: TOKENS,
    product: {
      ...PRODUCT,
      title: `Ring <script>alert("xss")</script>`,
      vendor: `Acme " onerror="alert(1)`,
    },
    currency: "USD",
  });
  assert.ok(!html.includes("<script>"), "a script tag survived into the block");
  assert.ok(html.includes("&lt;script&gt;"), "the title should survive as escaped text");
  // The danger is the vendor's quote CLOSING an attribute and starting a new
  // one. The literal characters `onerror=` sitting in escaped body text are
  // inert, so the assertion is about the quotes, not the word: no unescaped
  // double quote may follow the vendor's text.
  assert.ok(
    !html.includes(`" onerror="`),
    "an attribute break-out survived into the block",
  );
  assert.ok(html.includes("&quot;"), "the quote should have been escaped, not dropped");
});

test("only https image URLs are rendered", () => {
  for (const hostile of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "http://insecure.example/ring.jpg",
  ]) {
    const { html } = renderBlock({
      spec: { type: "product_facts" },
      tokens: TOKENS,
      product: { ...PRODUCT, featuredImage: hostile },
      currency: "USD",
    });
    assert.ok(!html.includes(hostile), `${hostile} was rendered into the block`);
  }
});

test("the block states only facts that came from the store", () => {
  const { html } = render();
  // Real: the price, and a discount that genuinely exists (12000 → 8900).
  assert.ok(html.includes("$89.00"));
  assert.ok(html.includes("26%"), "the real discount should be shown");
});

test("no discount claim appears when the store has no discount", () => {
  // The rule that separates this from a generator that decorates every product
  // with "SALE". A stale or absent compare-at price means there is no discount
  // to talk about, so the element is not rendered at all.
  const { html } = renderBlock({
    spec: { type: "product_facts" },
    tokens: TOKENS,
    product: { ...PRODUCT, compareAtCents: null },
    currency: "USD",
  });
  assert.ok(!/%/.test(html), "a discount was claimed for a product that has none");
  assert.ok(!/\bsave\b/i.test(html));
});

test("the block is self-contained — one root element and its own style", () => {
  const { html, css } = render();
  // It gets inserted into a live theme by DOM injection (WP-B) and by paste
  // (WP-D). Multiple roots would make both insertion points guesswork.
  const roots = html.match(new RegExp(`class="${BLOCK_PREFIX}[" ]`, "g")) ?? [];
  assert.equal(roots.length, 1, `expected exactly one block root, found ${roots.length}`);
  assert.ok(css.length > 0);
});

test("selectorsOf finds what it claims to find", () => {
  // Guards the guard: a selector extractor that returned [] would make the
  // scoping test above pass for any CSS at all.
  const found = selectorsOf(`
    .ev-blk { color: red }
    body, .ev-blk__title { margin: 0 }
    @media (max-width: 600px) { .ev-blk__grid { display: block } }
  `);
  assert.ok(found.includes("body"), `body not detected: ${JSON.stringify(found)}`);
  assert.ok(found.includes(".ev-blk__title"));
  assert.ok(found.includes(".ev-blk__grid"), "selectors inside @media must be checked too");
  assert.ok(!found.some((s) => s.startsWith("@")), "at-rules are not selectors");
});

test("a statement before a rule doesn't swallow the selector that follows it", () => {
  // The containment check is only worth anything if it FAILS CLOSED. An earlier
  // version dropped the whole head whenever it contained a `;`, so a leading
  // `@import` or `@charset` made the very next rule invisible to the check —
  // `body{}` could sit one line under an @import and be reported as nothing at
  // all. That matters from WP-C on, where this function is the gate on CSS the
  // model wrote rather than CSS we wrote.
  for (const [css, expected] of [
    ['@import url(evil.css);\nbody{color:red}', "body"],
    ['@charset "utf-8";\n* { margin: 0 }', "*"],
    ['@namespace svg url(http://www.w3.org/2000/svg);\nimg{width:1px}', "img"],
  ] as const) {
    const found = selectorsOf(css);
    assert.ok(
      found.includes(expected),
      `"${expected}" was swallowed — found ${JSON.stringify(found)}`,
    );
  }
});

test("keyframe steps are not mistaken for global selectors", () => {
  // `from`, `to` and `50%` are keyframe steps, not selectors — reporting them
  // as bare globals would block legitimate animation in WP-C for no reason.
  const found = selectorsOf(`
    @keyframes ev-fade{from{opacity:0}50%{opacity:.5}to{opacity:1}}
    .ev-blk__badge{animation:ev-fade .2s}
  `);
  assert.ok(!found.includes("from"), JSON.stringify(found));
  assert.ok(!found.includes("to"), JSON.stringify(found));
  assert.ok(found.includes(".ev-blk__badge"), "the real rule after it must survive");
});

test("an at-rule is never reported as a selector, however it's written", () => {
  const found = selectorsOf(`
    @media (max-width:600px){ .ev-blk{color:red} }
    @supports (display:grid){ .ev-blk__grid{display:grid} }
  `);
  assert.ok(!found.some((s) => s.startsWith("@")), JSON.stringify(found));
  assert.ok(found.includes(".ev-blk"));
  assert.ok(found.includes(".ev-blk__grid"));
});
