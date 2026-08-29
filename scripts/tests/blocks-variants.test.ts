import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOCK_VARIANTS,
  defaultVariant,
  isKnownVariant,
  resolveVariant,
} from "../../lib/blocks/variants";
import { BLOCK_CATALOG, type BlockSpecInput } from "../../lib/blocks/catalog";
import { renderBlock, BLOCK_PREFIX, selectorsOf } from "../../lib/blocks/render-block";
import { normalizeDesignTokens, type RawTokenSample } from "../../lib/blocks/design-tokens";
import type { BlocksProduct } from "../../lib/blocks/product-json";

/**
 * WP-F — the variant library, and the one rule that makes it safe.
 *
 * Offering visual choice reopens a question the feature had already answered:
 * if a layout can change, can it change what the block SAYS? It must not. Every
 * claim on a merchant's product page has to be one they typed, and a variant
 * that quietly added, dropped or reworded content would smuggle a claim past
 * the validator that exists to stop exactly that.
 *
 * So the central test here renders every variant of every type against
 * identical input and compares the TEXT that comes out. Layout may differ;
 * words may not.
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
  descriptionHtml: "",
  featuredImage: null,
  images: [],
  variants: [{ title: "Size 7", priceCents: 8900, available: true }],
};

/** One filled-in spec per type, so every variant has real content to move. */
const SPECS: Record<string, BlockSpecInput> = {
  trust_icons: {
    type: "trust_icons",
    items: [
      { icon: "shipping", label: "Free UK shipping", detail: "Orders over £50" },
      { icon: "returns", label: "60-day returns", detail: "" },
    ],
  },
  comparison: {
    type: "comparison",
    competitorName: "High-street jewellers",
    othersName: "Marketplace sellers",
    rows: [
      { label: "Price", ours: "£89", theirs: "£240", weWin: true },
      { label: "Materials", ours: "Solid brass", theirs: "Plated", weWin: true },
    ],
  },
  feature_grid: {
    type: "feature_grid",
    features: [
      { icon: "warranty", title: "Lifetime resize", line: "Free, for as long as you own it." },
      { icon: "sustainable", title: "Recycled brass", line: "Cast from reclaimed stock." },
    ],
  },
  brand_cards: {
    type: "brand_cards",
    promise: "We make one ring, properly.",
    benefits: ["Hand-finished", "Made in Britain", "No middlemen"],
    logoUrl: null,
  },
  product_stats: {
    type: "product_stats",
    stats: [{ label: "Repeat buyers", value: "38", unit: "%" }],
  },
};

/** Visible text only — tags and attributes stripped. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#12[35];/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function render(spec: BlockSpecInput, variant: string) {
  return renderBlock({
    spec: { ...spec, variant } as BlockSpecInput,
    tokens: TOKENS,
    product: PRODUCT,
    currency: "GBP",
  });
}

test("every catalogue type has variants, and every variant is reachable", () => {
  for (const entry of BLOCK_CATALOG) {
    const variants = BLOCK_VARIANTS[entry.id];
    assert.ok(variants?.length >= 1, `${entry.id} has no variants`);
    assert.equal(
      defaultVariant(entry.id),
      variants[0].id,
      `${entry.id}'s default should be the first entry`,
    );
    for (const v of variants) {
      assert.ok(isKnownVariant(entry.id, v.id), `${entry.id}/${v.id} not recognised`);
    }
  }
});

/**
 * Glyphs and connectors a LAYOUT may legitimately introduce.
 *
 * Declared explicitly and kept short, because this list is the only escape from
 * the rule below — anything added here should be arguable as punctuation rather
 * than as something the block is saying. A "—" in an empty cell is a typographic
 * placeholder; "Free shipping" would be a claim.
 */
const LAYOUT_GLYPHS = new Set(["—", "✓", "✗", "vs", "of", "-"]);

/**
 * Words the merchant (or the store) actually supplied — VALUES only.
 *
 * The first version of this built the set from `JSON.stringify(spec)`, which
 * quietly admitted every JSON KEY and every identifier we chose ourselves. I
 * probed it: `shipping`, `returns`, `available`, `title`, `label`, `detail`,
 * `vendor` and `icon` were all "supplied", so a variant printing "Free
 * shipping" as its own claim would have sailed through the one test written to
 * stop exactly that. The test was checking the shape of our data structure, not
 * the merchant's words.
 *
 * `icon` is skipped explicitly: those ids are a closed set WE picked, so their
 * names are ours, not the merchant's, and must never license printing them.
 */
function suppliedWords(...sources: unknown[]): Set<string> {
  const words = new Set<string>();
  const visit = (node: unknown, key?: string) => {
    if (key === "icon" || key === "type" || key === "variant") return;
    if (typeof node === "string" || typeof node === "number") {
      for (const w of String(node)
        .replace(/[^\p{L}\p{N}£$€%.,'-]+/gu, " ")
        .split(" ")) {
        if (w) words.add(w);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) visit(v, k);
    }
  };
  sources.forEach((s) => visit(s));
  return words;
}

test("a variant never shows a word the merchant didn't supply", () => {
  /**
   * The rule that lets visual choice exist without reopening the truthfulness
   * question.
   *
   * The first version of this asserted that every variant produced IDENTICAL
   * text, and it failed correctly on the three-column comparison — which shows
   * the merchant's `othersName`, a field the two-column variant has no place
   * for. That is a variant showing MORE of the merchant's own data, not a
   * variant inventing something, and the rule was simply mis-stated.
   *
   * What actually matters: nothing appears that the merchant didn't type. So
   * every word a variant adds must be traceable to the spec, to the product, or
   * to the short list of typographic glyphs above.
   */
  for (const entry of BLOCK_CATALOG) {
    const spec = SPECS[entry.id];
    assert.ok(spec, `no fixture for ${entry.id}`);

    /**
     * EVERY variant, including the default — and no baseline.
     *
     * The previous version did `variants.slice(1)` and allowed anything the
     * FIRST variant printed. Both were holes a verifier walked through: the
     * default of every type (two_col, row_line, cards_3, promise_led, tiles)
     * was never asserted on at all, so an invented claim in a default passed
     * the suite; and using our own renderer's output as the allowlist meant a
     * default could launder words for all its siblings. The complaint that
     * produced the last fix was that the allowlist "was checking our data
     * shape, not their words" — a baseline built from our own HTML was the
     * same mistake wearing a different hat, and a wider channel than the JSON
     * keys it replaced.
     *
     * The allowlist is now only what the merchant and the store supplied.
     */
    const supplied = suppliedWords(spec, PRODUCT);

    for (const v of BLOCK_VARIANTS[entry.id]) {
      const words = textOf(render(spec, v.id).html).split(" ").filter(Boolean);
      const invented = words.filter(
        (w) => !supplied.has(w) && !LAYOUT_GLYPHS.has(w),
      );
      assert.deepEqual(
        invented,
        [],
        `${entry.id}/${v.id} shows words nobody supplied: ${invented.join(", ")}`,
      );
    }
  }
});

test("every variant of every type stays inside the block", () => {
  // The containment rule, re-checked per variant — new CSS is exactly where a
  // stray global selector would arrive unnoticed.
  for (const entry of BLOCK_CATALOG) {
    for (const v of BLOCK_VARIANTS[entry.id]) {
      const { css } = render(SPECS[entry.id], v.id);
      for (const sel of selectorsOf(css)) {
        assert.ok(
          sel.startsWith(`.${BLOCK_PREFIX}`),
          `${entry.id}/${v.id}: "${sel}" escapes the block`,
        );
      }
    }
  }
});

test("an unknown or missing variant falls back instead of failing", () => {
  // Projects saved before variants existed carry none, and a variant withdrawn
  // later must still open the project that referenced it. The merchant's
  // content is intact either way; layout is the part that can safely change.
  for (const entry of BLOCK_CATALOG) {
    const fallback = BLOCK_VARIANTS[entry.id][0];
    for (const bad of [undefined, null, "", "never_existed"]) {
      assert.equal(
        resolveVariant(entry.id, bad).id,
        fallback.id,
        `${entry.id} with ${JSON.stringify(bad)}`,
      );
    }
    // And it still renders, rather than throwing on the way past.
    assert.doesNotThrow(() => render(SPECS[entry.id], "never_existed"));
  }
});

test("the three-column comparison only appears when the merchant named the column", () => {
  // We autofill no competitor, ever — not even a generic "Others". An unnamed
  // third column would be us inventing one, which is the single thing this
  // block may never do.
  const named = render(SPECS.comparison, "three_col").html;
  assert.ok(named.includes("Marketplace sellers"));

  const unnamed = render(
    { ...SPECS.comparison, othersName: null } as BlockSpecInput,
    "three_col",
  ).html;
  assert.ok(
    !/Others|Everyone else/i.test(unnamed),
    "an unnamed third column was invented",
  );
  // Falls back to the two-column table rather than rendering a headless column.
  assert.ok(unnamed.includes(`${BLOCK_PREFIX}__table--two`));
});

test("the checklist variant is a list, not a table", () => {
  // It exists because a three-column table is unreadable on a phone however it
  // is styled. If it rendered a table anyway, it would have no reason to exist.
  const { html } = render(SPECS.comparison, "checklist");
  assert.ok(!html.includes("<table"), "the checklist rendered a table");
  assert.ok(html.includes(`${BLOCK_PREFIX}__checklist`));
});

test("every catalogue entry cites a reference that exists in the file", () => {
  // The references file is the source the variants come from. An entry citing a
  // heading nobody wrote is a design nobody can defend — which is the whole
  // reason that file exists.
  const doc = readFileSync(
    join(process.cwd(), "lib", "blocks", "design-references.md"),
    "utf8",
  );
  // Typographic quotes are normalised on both sides: the markdown and the
  // TypeScript disagreed on straight vs curly, which is a difference in
  // rendering, not in what either says.
  const norm = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  const headings = [...doc.matchAll(/^##\s+(.+)$/gm)].map((m) => norm(m[1]));
  assert.ok(headings.length >= 7, `only found ${headings.length} reference sections`);

  for (const entry of BLOCK_CATALOG) {
    assert.ok(
      headings.some((h) => h.startsWith(norm(entry.reference))),
      `${entry.id} cites "${entry.reference}", which is not a heading in design-references.md`,
    );
  }
  for (const [type, variants] of Object.entries(BLOCK_VARIANTS)) {
    for (const v of variants) {
      assert.ok(
        headings.some((h) => h.startsWith(norm(v.reference))),
        `${type}/${v.id} cites "${v.reference}", which is not a heading`,
      );
    }
  }
});

test("a block whose market equivalent is interactive says so before it is chosen", () => {
  // The honesty line. A merchant discovering after the fact that half a block
  // does not work is the experience this tool is supposed to be an escape from.
  for (const entry of BLOCK_CATALOG) {
    if (entry.interactivity === "presentational") {
      assert.ok(
        entry.limitation && entry.limitation.trim().length > 0,
        `${entry.id} is presentational but states no limitation`,
      );
    }
  }
});

test("no variant introduces a runtime request", () => {
  // Inline SVG only. A block that fetches anything is a block that can be slow
  // or broken on someone else's storefront — the exact cost this product sells
  // against.
  for (const entry of BLOCK_CATALOG) {
    for (const v of BLOCK_VARIANTS[entry.id]) {
      const { html, css } = render(SPECS[entry.id], v.id);
      assert.ok(!/@import/i.test(css), `${entry.id}/${v.id}: @import`);
      assert.ok(
        !/url\s*\(\s*['"]?https?:/i.test(css),
        `${entry.id}/${v.id}: remote url() in CSS`,
      );
      assert.ok(!/<script/i.test(html), `${entry.id}/${v.id}: script tag`);
      assert.ok(!/<link/i.test(html), `${entry.id}/${v.id}: link tag`);
    }
  }
});

test("every class the renderer emits has a CSS rule behind it", () => {
  /**
   * A class in the markup with no rule in the stylesheet is not cosmetic here.
   * The block is injected into a merchant's own page, so an unstyled element
   * does not fall back to "plain" — it inherits whatever the THEME says about
   * that tag, which is the one thing this feature promises not to do. The
   * `.ev-blk` scoping keeps our CSS off their page; this keeps their CSS off
   * our block.
   *
   * It is also the drift alarm for WP-F. Every new variant adds markup, and a
   * modifier class that was renamed on one side only produces exactly this.
   */
  const emitted = new Set<string>();
  const styled = new Set<string>();

  for (const entry of BLOCK_CATALOG) {
    for (const v of BLOCK_VARIANTS[entry.id]) {
      const { html, css } = render(SPECS[entry.id], v.id);
      for (const m of html.matchAll(/\sclass="([^"]*)"/g)) {
        for (const cls of m[1].split(/\s+/).filter(Boolean)) emitted.add(cls);
      }
      for (const sel of selectorsOf(css)) {
        for (const m of sel.matchAll(/\.([A-Za-z0-9_-]+)/g)) styled.add(m[1]);
      }
    }
  }

  assert.ok(emitted.size > 10, "the scan found almost no markup — the walk is broken");
  const dead = [...emitted].filter((c) => !styled.has(c)).sort();
  assert.deepEqual(dead, [], `classes emitted with no CSS rule: ${dead.join(", ")}`);
});
