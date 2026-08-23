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
import type { BlockSpecInput } from "../../lib/blocks/catalog";
import { validateLiquidSnippet } from "../../lib/blocks/liquid-validate";

/**
 * WP-C — the four MVP blocks, in both of the forms they exist in.
 *
 * # Why one renderer produces both
 * The preview is the promise ("this is how it will look") and the Liquid is
 * what's delivered against that promise. Generating them from separate code
 * paths means they can disagree, and the one place a disagreement shows up is
 * the merchant's live storefront after they've paid. So the same function emits
 * both: preview mode substitutes the product's real values, Liquid mode
 * substitutes Liquid expressions, and everything else — structure, classes,
 * CSS, the user's own claims — is byte-identical.
 *
 * The claims are literal in BOTH modes on purpose. They came from the merchant,
 * not from the product endpoint, so there is no Liquid object to read them from.
 */

const RAW: RawTokenSample = {
  bodyBackground: "rgb(255,255,255)",
  bodyColor: "rgb(18,18,18)",
  bodyFontFamily: "Assistant, sans-serif",
  bodyFontSize: "16px",
  bodyFontWeight: "400",
  headingFontFamily: "Georgia, serif",
  headingFontWeight: "700",
  headingColor: "rgb(18,18,18)",
  headingFontSize: "32px",
  buttonBackground: "rgb(18,74,61)",
  buttonColor: "rgb(255,255,255)",
  buttonBorderRadius: "8px",
  buttonBorderColor: "rgb(18,74,61)",
  containerMaxWidth: "1200px",
  cardShadow: "rgba(0,0,0,0.08) 0px 2px 8px 0px",
  surfaceBackground: "rgb(250,250,250)",
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
  variants: [{ title: "Size 7", priceCents: 8900, available: true }],
};

const SPECS: BlockSpecInput[] = [
  {
    type: "trust_icons",
    items: [
      { icon: "shipping", label: "Free shipping over $50", detail: "3-5 business days" },
      { icon: "returns", label: "30-day returns", detail: "" },
    ],
  },
  {
    type: "brand_cards",
    promise: "Rings that outlive the trend cycle.",
    benefits: ["Solid brass, not plated", "Hand-finished in Lisbon", "Free resizing for life"],
    logoUrl: null,
  },
  {
    type: "comparison",
    competitorName: "Typical high-street ring",
    rows: [
      { label: "Price", ours: "$89", theirs: "$140", weWin: true },
      { label: "Delivery", ours: "3-5 days", theirs: "Next day", weWin: false },
    ],
  },
  {
    type: "product_stats",
    stats: [
      { label: "Repeat buyers", value: "38", unit: "%" },
      { label: "Average rating", value: "4.8", unit: "/5" },
    ],
  },
];

function render(spec: BlockSpecInput, mode: "preview" | "liquid" = "preview") {
  return renderBlock({ spec, tokens: TOKENS, product: PRODUCT, currency: "USD", mode });
}

test("all four blocks render, and every selector stays inside the block", () => {
  for (const spec of SPECS) {
    const { html, css } = render(spec);
    assert.ok(html.length > 0, `${spec.type} rendered nothing`);
    const selectors = selectorsOf(css);
    assert.ok(selectors.length > 0, `${spec.type}: no selectors found`);
    for (const sel of selectors) {
      assert.ok(
        sel.startsWith(`.${BLOCK_PREFIX}`),
        `${spec.type}: "${sel}" escapes the block`,
      );
    }
  }
});

test("every block's Liquid form passes the same gate we hold the model to", () => {
  // If our own deterministic template couldn't pass validateLiquidSnippet, the
  // fallback would be unusable exactly when it's needed most.
  for (const spec of SPECS) {
    const { liquid } = render(spec, "liquid");
    const res = validateLiquidSnippet(liquid ?? "");
    assert.equal(res.ok, true, `${spec.type}: ${res.ok ? "" : res.problems.join(" | ")}`);
  }
});

test("preview mode shows the product's real values", () => {
  const { html } = render(SPECS[3]);
  assert.ok(html.includes("Beveled Signet Ring"), html.slice(0, 200));
});

test("Liquid mode reads the product from Liquid instead of baking values in", () => {
  // A baked-in title is wrong the moment the merchant renames the product, and
  // a baked-in price is wrong the moment they run a sale — on a snippet that
  // lives in their theme indefinitely.
  const { liquid } = render(SPECS[3], "liquid");
  assert.ok(liquid);
  assert.ok(liquid.includes("{{ product.title }}"), liquid.slice(0, 300));
  assert.ok(!liquid.includes("Beveled Signet Ring"), "the title was baked in");
});

test("prices in Liquid mode go through the money filter", () => {
  // `{{ product.price }}` renders 8900. The money filter is what makes it
  // $89.00 — and in the shopper's currency, which a baked value never is.
  //
  // Asserted on the facts panel, which is the only block that shows a price:
  // the catalogue blocks carry the merchant's own claims, and a price they
  // typed is a literal string with no Liquid object behind it.
  const { liquid } = renderBlock({
    spec: { type: "product_facts" },
    tokens: TOKENS,
    product: PRODUCT,
    currency: "USD",
    mode: "liquid",
  });
  assert.ok(/\{\{\s*product\.price\s*\|\s*money\s*\}\}/.test(liquid ?? ""), liquid?.slice(0, 400));
});

test("a discount is recomputed by the theme, not frozen at export time", () => {
  // The failure this prevents: a snippet that lives in a theme for a year and
  // keeps announcing a sale that ended in March. The condition and the
  // arithmetic both belong to Liquid.
  const { liquid } = renderBlock({
    spec: { type: "product_facts" },
    tokens: TOKENS,
    product: PRODUCT,
    currency: "USD",
    mode: "liquid",
  });
  assert.ok(liquid);
  assert.ok(
    /compare_at_price\s*>\s*product\.price/.test(liquid),
    "the discount should be conditional on there still being one",
  );
  assert.ok(!liquid.includes("26%"), "today's discount was baked in");
});

test("the merchant's own claims stay literal in both modes", () => {
  // They came from the merchant, not from the product endpoint — there is no
  // Liquid object holding "Free shipping over $50".
  const preview = render(SPECS[0]).html;
  const liquid = render(SPECS[0], "liquid").liquid ?? "";
  for (const text of ["Free shipping over $50", "30-day returns"]) {
    assert.ok(preview.includes(text), `preview lost "${text}"`);
    assert.ok(liquid.includes(text), `liquid lost "${text}"`);
  }
});

test("the CSS is identical in both modes — it is the same block", () => {
  for (const spec of SPECS) {
    assert.equal(
      render(spec).css,
      render(spec, "liquid").css,
      `${spec.type}: preview and export disagree on styling`,
    );
  }
});

test("a hostile claim is escaped, in both modes", () => {
  const hostile: BlockSpecInput = {
    type: "trust_icons",
    items: [{ icon: "shipping", label: `<script>alert(1)</script>`, detail: `" onload="x` }],
  };
  for (const mode of ["preview", "liquid"] as const) {
    const out = render(hostile, mode);
    const body = mode === "liquid" ? (out.liquid ?? "") : out.html;
    assert.ok(!body.includes("<script>"), `${mode}: script tag survived`);
    assert.ok(!body.includes(`" onload="`), `${mode}: attribute break-out survived`);
  }
});

test("a comparison marks the rows the merchant said they win, and only those", () => {
  const { html } = render(SPECS[2]);
  // Two rows, one won. Whatever the win marker is, it must appear once.
  const markers = html.match(/data-ev-win="true"/g) ?? [];
  assert.equal(markers.length, 1, html);
});

test("a stats block renders each figure with its unit", () => {
  const { html } = render(SPECS[3]);
  assert.ok(html.includes("38"));
  assert.ok(html.includes("%"));
  assert.ok(html.includes("4.8"));
});

test("a brand block with no logo renders no image element", () => {
  const { html } = render(SPECS[1]);
  assert.ok(!/<img/.test(html), "an empty logo slot produced an image tag");
});
