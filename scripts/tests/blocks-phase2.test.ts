import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBlock, BLOCK_CHROME, selectorsOf } from "../../lib/blocks/render-block";
import { validateBlockSpec, type BlockSpecInput } from "../../lib/blocks/catalog";
import { BLOCK_VARIANTS } from "../../lib/blocks/variants";
import { validateLiquidSnippet } from "../../lib/blocks/liquid-validate";
import { normalizeDesignTokens, type RawTokenSample } from "../../lib/blocks/design-tokens";
import type { BlocksProduct } from "../../lib/blocks/product-json";

/**
 * WP-F phase 2 — spec_table, assurance_bar, bundle_tiers, low_stock.
 *
 * The two blocks worth the most scrutiny here are the ones that stop being
 * literal: `bundle_tiers` does arithmetic on the merchant's price, and
 * `low_stock` emits control flow that runs inside the merchant's theme. Both
 * are new kinds of risk for this codebase — everything before them rendered
 * text the merchant had typed.
 */

const RAW: RawTokenSample = {
  bodyBackground: "rgb(255,255,255)",
  bodyColor: "rgb(18,18,18)",
  bodyFontFamily: "Assistant, sans-serif",
  bodyFontFamilyApplied: "Assistant",
  bodyFontSize: "16px",
  bodyFontWeight: "400",
  headingFontFamily: "Georgia, serif",
  headingFontFamilyApplied: "Georgia",
  headingFontWeight: "700",
  headingColor: "rgb(18,18,18)",
  headingFontSize: "32px",
  buttonBackground: "rgb(18,74,61)",
  buttonColor: "rgb(255,255,255)",
  buttonBorderRadius: "6px",
  buttonBorderColor: "rgb(18,74,61)",
  containerMaxWidth: "1200px",
  cardShadow: "none",
  surfaceBackground: "rgb(250,250,250)",
  buttonWasVisible: true,
};
const TOKENS = normalizeDesignTokens(RAW);

const PRODUCT: BlocksProduct = {
  title: "Signet ring",
  handle: "signet-ring",
  vendor: "Foundry",
  priceCents: 8900,
  compareAtCents: null,
  featuredImage: null,
  available: true,
  variants: [],
} as unknown as BlocksProduct;

function render(spec: BlockSpecInput, mode: "preview" | "liquid" = "preview") {
  return renderBlock({ spec, tokens: TOKENS, product: PRODUCT, currency: "GBP", mode });
}

// ── bundle_tiers ────────────────────────────────────────────────────────────

const TIERS: BlockSpecInput = {
  type: "bundle_tiers",
  tiers: [
    { quantity: 1, discountPercent: 0, highlight: false },
    { quantity: 2, discountPercent: 10, highlight: true },
    { quantity: 3, discountPercent: 20, highlight: false },
  ],
};

test("volume pricing does the arithmetic on the measured price", () => {
  /**
   * The one block whose output is neither the merchant's words nor the store's
   * own values, but a calculation on top of them. A wrong total here is a wrong
   * price on a real storefront, so it is pinned to the digit rather than left
   * to the word-level invariant, which deliberately waives money.
   */
  const text = render(TIERS).html.replace(/<[^>]+>/g, " ");
  // 1 × £89.00, no discount.
  assert.match(text, /£89\.00/);
  // 2 × £89.00 less 10% = £160.20, at £80.10 each, saving £17.80.
  assert.match(text, /£160\.20/);
  assert.match(text, /£80\.10/);
  assert.match(text, /£17\.80/);
  // 3 × £89.00 less 20% = £213.60, at £71.20 each, saving £53.40.
  assert.match(text, /£213\.60/);
  assert.match(text, /£71\.20/);
  assert.match(text, /£53\.40/);
});

test("volume pricing stores no money — the Liquid recomputes it", () => {
  /**
   * The reason this block exists in this shape. A merchant who changes their
   * price must not find a panel quoting the old one months later, so the export
   * carries the ARITHMETIC, never the result.
   */
  const { liquid } = render(TIERS, "liquid");
  assert.ok(liquid);
  // The total is assigned ONCE and the other two figures derive from it, so
  // the panel cannot contradict itself — see the note on `cell`. Asserting the
  // literal chain is what pins the export side against a silent rewrite.
  assert.match(liquid!, /assign ev_total_1 = product\.price \| times: 2 \| times: 90 \| divided_by: 100/);
  assert.match(liquid!, /ev_total_1 \| divided_by: 2 \| money/);
  assert.match(liquid!, /product\.price \| times: 2 \| minus: ev_total_1 \| money/);
  // The figures the preview showed must not appear anywhere in the export.
  for (const frozen of ["160.20", "80.10", "213.60", "17.80"]) {
    assert.ok(!liquid!.includes(frozen), `the export froze ${frozen} instead of computing it`);
  }
});

test("volume pricing says inside the block that it does not add to cart", () => {
  /**
   * The catalogue says it too, but the shopper never saw the catalogue. The
   * owner rejected an earlier draft that kept a radio affordance for fidelity:
   * a shopper who clicks a dead control concludes the STORE is broken.
   */
  for (const v of BLOCK_VARIANTS.bundle_tiers) {
    const html = renderBlock({
      spec: { ...(TIERS as object), variant: v.id } as BlockSpecInput,
      tokens: TOKENS,
      product: PRODUCT,
      currency: "GBP",
    }).html;
    assert.match(html.replace(/<[^>]+>/g, " "), /add to cart at the usual button/i);
    // Nothing that invites a click, in either mode.
    assert.ok(!/<input|<button|type="radio"|role="radio"/i.test(html), `${v.id} renders a control`);
  }
});

test("volume pricing refuses a spec that would publish a wrong price", () => {
  const bad = (tiers: unknown) =>
    validateBlockSpec({ type: "bundle_tiers", tiers } as BlockSpecInput);

  // Two tiers for the same quantity renders two prices for one purchase.
  assert.equal(
    bad([
      { quantity: 2, discountPercent: 10, highlight: false },
      { quantity: 2, discountPercent: 20, highlight: false },
    ]).ok,
    false,
  );
  // A free product, one typo away.
  assert.equal(
    bad([
      { quantity: 1, discountPercent: 0, highlight: false },
      { quantity: 2, discountPercent: 100, highlight: false },
    ]).ok,
    false,
  );
  // Two "most popular" ribbons contradict each other.
  assert.equal(
    bad([
      { quantity: 1, discountPercent: 0, highlight: true },
      { quantity: 2, discountPercent: 10, highlight: true },
    ]).ok,
    false,
  );
});

test("a tier that punishes buying more is allowed, but warned about", () => {
  const result = validateBlockSpec({
    type: "bundle_tiers",
    tiers: [
      { quantity: 2, discountPercent: 20, highlight: false },
      { quantity: 3, discountPercent: 5, highlight: false },
    ],
  } as BlockSpecInput);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.warnings.some((w) => /penalty for buying more/.test(w)));
});

// ── low_stock ───────────────────────────────────────────────────────────────

const STOCK: BlockSpecInput = { type: "low_stock", threshold: 6 };

test("low stock reads inventory live and renders nothing when untracked", () => {
  /**
   * The endpoint this feature measures from returns `available` as a boolean
   * and no quantity, so a number the merchant typed would be a lie by the
   * following morning. The export asks the theme instead — and a store that
   * does not track stock must render NOTHING, not an empty box or a zero.
   */
  const { liquid } = render(STOCK, "liquid");
  assert.ok(liquid);
  assert.match(liquid!, /inventory_quantity/);
  assert.match(liquid!, /inventory_management != blank/);
  assert.match(liquid!, /ev_stock > 0 and ev_stock <= 6/);
  // The threshold is a CONDITION in the export, never printed as a count.
  assert.ok(
    !/Only 6 left/.test(liquid!),
    "the export froze the threshold as the stock count",
  );
});

test("the low-stock preview labels its example rather than implying a real count", () => {
  const text = render(STOCK).html.replace(/<[^>]+>/g, " ");
  assert.match(text, /Only 6 left/);
  assert.match(text, /Example — your theme shows the live count/);
});

test("low stock refuses a threshold that isn't a usable stock level", () => {
  for (const threshold of [0, -3, 2.5, 101, "6" as unknown as number, undefined]) {
    const r = validateBlockSpec({ type: "low_stock", threshold } as BlockSpecInput);
    assert.equal(r.ok, false, `threshold ${String(threshold)} was accepted`);
  }
  // High but legitimate: warned, not refused.
  const high = validateBlockSpec({ type: "low_stock", threshold: 60 } as BlockSpecInput);
  assert.equal(high.ok, true);
  assert.ok(high.ok && high.warnings.length > 0);
});

// ── spec_table / assurance_bar ──────────────────────────────────────────────

test("a spec table is never autofilled from the product endpoint", () => {
  // Shopify exposes a weight and a type. Putting our reading of their catalogue
  // on their page as though they had checked it is the invention this whole
  // feature refuses.
  const r = validateBlockSpec({
    type: "spec_table",
    rows: [{ label: "Material", value: "" }],
  } as BlockSpecInput);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.missing.some((m) => /your own answer/.test(m)));
});

test("one row is not a table, and five promises are not an assurance bar", () => {
  assert.equal(
    validateBlockSpec({
      type: "spec_table",
      rows: [{ label: "Material", value: "Brass" }],
    } as BlockSpecInput).ok,
    false,
  );
  // §5: the strip is a floor under the decision. Four claims compete with the
  // buy button it exists to support — the merchant is pointed at Trust icons.
  const many = validateBlockSpec({
    type: "assurance_bar",
    items: Array.from({ length: 4 }, () => ({ icon: "returns", text: "30-day returns" })),
  } as BlockSpecInput);
  assert.equal(many.ok, false);
  assert.ok(!many.ok && many.missing.some((m) => /use Trust icons/.test(m)));
});

// ── shared invariants ───────────────────────────────────────────────────────

const PHASE2: BlockSpecInput[] = [
  { type: "spec_table", rows: [{ label: "Material", value: "Brass" }, { label: "Width", value: "2.4mm" }] },
  { type: "assurance_bar", items: [{ icon: "returns", text: "60-day returns" }] },
  TIERS,
  STOCK,
];

test("every new block passes the Liquid validator in every variant", () => {
  /**
   * `low_stock` is the first block to emit control flow rather than text, so
   * this is the first time the validator has been asked about `{%- if -%}` from
   * our own renderer. A snippet it refuses is a snippet that cannot be sold.
   */
  for (const spec of PHASE2) {
    for (const v of BLOCK_VARIANTS[spec.type]) {
      const { liquid } = renderBlock({
        spec: { ...(spec as object), variant: v.id } as BlockSpecInput,
        tokens: TOKENS,
        product: PRODUCT,
        currency: "GBP",
        mode: "liquid",
      });
      assert.ok(liquid, `${spec.type}/${v.id} produced no Liquid`);
      const verdict = validateLiquidSnippet(liquid!);
      assert.equal(verdict.ok, true, `${spec.type}/${v.id}: ${JSON.stringify(verdict)}`);
    }
  }
});

test("every new block keeps its CSS inside .ev-blk", () => {
  for (const spec of PHASE2) {
    for (const v of BLOCK_VARIANTS[spec.type]) {
      const { css } = renderBlock({
        spec: { ...(spec as object), variant: v.id } as BlockSpecInput,
        tokens: TOKENS,
        product: PRODUCT,
        currency: "GBP",
      });
      for (const sel of selectorsOf(css)) {
        assert.ok(sel.startsWith(".ev-blk"), `${spec.type}/${v.id}: "${sel}" escapes`);
      }
    }
  }
});

test("the chrome vocabulary stays a short list of labels, not claims", () => {
  /**
   * The escape hatch that lets the renderer print a word the merchant did not
   * type. It is only safe while it stays boring, so its shape is asserted
   * rather than trusted: single lowercase-or-capitalised words, no digits, no
   * punctuation — nothing that can be a sentence about someone's business.
   *
   * "Free shipping" cannot arrive here by accident. It can only arrive by
   * somebody adding it to a list with this test sitting under it.
   */
  assert.ok(BLOCK_CHROME.length <= 40, `chrome has grown to ${BLOCK_CHROME.length} words`);
  for (const word of BLOCK_CHROME) {
    assert.match(word, /^[A-Za-z]+$/, `"${word}" is not a bare word`);
  }
});

test("a store that doesn't track stock receives nothing at all — including CSS", () => {
  /**
   * The guard used to wrap only the markup, so the ~7KB stylesheet was injected
   * into every product page of a store where the block deliberately renders
   * nothing. "Renders nothing at all" has to mean nothing, or it is just a
   * smaller version of the overreach this whole feature is sold against.
   *
   * Asserted structurally: the opening condition must come BEFORE the style
   * tag, and the closing endif after it.
   */
  const { liquid } = render(STOCK, "liquid");
  assert.ok(liquid);
  const ifAt = liquid!.indexOf("{%- if ev_v.inventory_management");
  const styleAt = liquid!.indexOf("<style>");
  const endAt = liquid!.lastIndexOf("{%- endif -%}");
  assert.ok(ifAt !== -1 && styleAt !== -1, "the snippet lost its guard or its style");
  assert.ok(ifAt < styleAt, "the stylesheet ships outside the condition");
  assert.ok(endAt > styleAt, "the condition closes before the stylesheet");
});

test("blocks that always render carry no guard", () => {
  // The wrapper is machinery for one block. If it leaked into the others they
  // would each acquire a condition nobody asked for.
  for (const spec of [PHASE2[0], PHASE2[1], TIERS]) {
    const { liquid } = render(spec, "liquid");
    assert.ok(!/\{%-? *if /.test(liquid ?? ""), `${spec.type} grew a condition`);
  }
});

/**
 * Evaluate the Liquid the export actually emits, with Liquid's own semantics.
 *
 * `divided_by` on integers TRUNCATES, `times` and `minus` are integer ops, and
 * `money` formats cents. Reimplemented here rather than mocked, so the test
 * fails when the emitted filter chain changes as well as when the preview does.
 */
function evalLiquidMoney(liquid: string, priceCents: number): string[] {
  const vars: Record<string, number> = { "product.price": priceCents };
  const out: string[] = [];
  const run = (expr: string): number => {
    const parts = expr.split("|").map((s) => s.trim());
    let acc = parts[0] in vars ? vars[parts[0]] : Number(parts[0]);
    for (const step of parts.slice(1)) {
      const [filter, rawArg] = step.split(":").map((s) => s.trim());
      if (filter === "money") continue;
      const arg = rawArg in vars ? vars[rawArg] : Number(rawArg);
      if (filter === "times") acc = acc * arg;
      else if (filter === "minus") acc = acc - arg;
      // Liquid truncates toward zero on integer division.
      else if (filter === "divided_by") acc = Math.trunc(acc / arg);
      else throw new Error(`unmodelled filter: ${filter}`);
    }
    return acc;
  };
  for (const line of liquid.split("\n")) {
    for (const m of line.matchAll(/\{%-?\s*assign\s+(\w+)\s*=\s*([^%]+?)\s*-?%\}/g)) {
      vars[m[1]] = run(m[2]);
    }
    for (const m of line.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
      out.push((run(m[1]) / 100).toFixed(2));
    }
  }
  return out;
}

test("the preview and the export quote the SAME money, to the penny", () => {
  /**
   * The defect this pins reached a shipped commit: the preview used Math.round
   * while Liquid's divided_by truncates, so 603 of 756 realistic combinations
   * disagreed — the merchant approved one number and their shoppers saw
   * another. $9.99 × 3 at 50% off previewed as $14.99 and exported as $14.98.
   *
   * A grid rather than a couple of cases, because the original test used 8900
   * with 10% and 20% off, where every product divides by 100 exactly and no
   * rounding mode is distinguishable.
   */
  const prices = [1, 999, 1999, 3333, 8900, 12345];
  const discounts = [0, 7, 15, 33, 50, 90];
  const quantities = [1, 2, 3, 6];

  for (const priceCents of prices) {
    for (const off of discounts) {
      for (const q of quantities) {
        const spec = {
          type: "bundle_tiers",
          tiers: [{ quantity: q, discountPercent: off, highlight: false }],
        } as BlockSpecInput;
        const product = { ...PRODUCT, priceCents } as BlocksProduct;
        const common = { spec, tokens: TOKENS, product, currency: "USD" as string | null };

        const shown = renderBlock({ ...common })
          .html.replace(/<[^>]+>/g, " ")
          .match(/\$[\d,]+\.\d\d/g)!
          .map((s) => s.replace(/[$,]/g, ""));
        const exported = evalLiquidMoney(
          renderBlock({ ...common, mode: "liquid" }).liquid!,
          priceCents,
        );

        assert.deepEqual(
          shown,
          exported,
          `price ${priceCents} × ${q} at ${off}% off: preview ${shown.join("/")} vs export ${exported.join("/")}`,
        );
      }
    }
  }
});

test("a bundle row adds up: unit × quantity and total + saved both reconcile", () => {
  /**
   * The panel used to contradict itself. `saved` was computed from the price
   * independently of `total`, so both floored separately and 527 of 756
   * combinations rendered a panel where total + saved ≠ quantity × price. And
   * `unit` was the discounted single price rather than total ÷ quantity, so
   * unit × quantity disagreed with the total ON THE SAME ROW — the one
   * multiplication a shopper is likely to do.
   */
  for (const priceCents of [999, 1999, 3333, 8900]) {
    for (const off of [7, 15, 33, 50]) {
      for (const q of [2, 3, 6]) {
        const liquid = renderBlock({
          spec: {
            type: "bundle_tiers",
            tiers: [{ quantity: q, discountPercent: off, highlight: false }],
          } as BlockSpecInput,
          tokens: TOKENS,
          product: { ...PRODUCT, priceCents } as BlocksProduct,
          currency: "USD",
          mode: "liquid",
        }).liquid!;
        const [total, unit, saved] = evalLiquidMoney(liquid, priceCents).map((v) =>
          Math.round(Number(v) * 100),
        );

        assert.equal(
          total + saved,
          priceCents * q,
          `${priceCents}×${q} @${off}%: total ${total} + saved ${saved} ≠ ${priceCents * q}`,
        );
        // Integer cents cannot always divide evenly, so the honest bound is
        // "never overstates, and never by more than a penny per unit".
        assert.ok(
          unit * q <= total && total - unit * q < q,
          `${priceCents}×${q} @${off}%: unit ${unit} × ${q} does not reconcile with total ${total}`,
        );
      }
    }
  }
});

test("a discount must be a whole percentage", () => {
  /**
   * A fractional discount passed validation and was written into the merchant's
   * theme as a float literal — `times: 87.5` — which drags the whole Liquid
   * chain into floating point and hands `money` a non-integer cent value it is
   * not specified for. Reachable by typing a decimal into the composer, not
   * only by a crafted request.
   */
  const r = validateBlockSpec({
    type: "bundle_tiers",
    tiers: [
      { quantity: 1, discountPercent: 0, highlight: false },
      { quantity: 2, discountPercent: 12.5, highlight: false },
    ],
  } as BlockSpecInput);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.missing.some((m) => /whole percentage/.test(m)));
});

test("the popular flag must be a real boolean, not merely truthy", () => {
  /**
   * The validator counted with `=== true` while the renderer branched on
   * truthiness, so `highlight: "yes"` counted as zero here and rendered a
   * ribbon there — two "Most popular" ribbons on one panel, the exact
   * self-contradiction the rule exists to prevent.
   */
  const r = validateBlockSpec({
    type: "bundle_tiers",
    tiers: [
      { quantity: 1, discountPercent: 0, highlight: "yes" },
      { quantity: 2, discountPercent: 10, highlight: true },
    ],
  } as unknown as BlockSpecInput);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.missing.some((m) => /true or false/.test(m)));
});

test("a sparse array is refused rather than validated by omission", () => {
  /**
   * `forEach`, `some` and `filter` all SKIP holes. So `[<hole>, {…}]` was never
   * inspected, validated clean, and then threw inside the renderer — a
   * validator returning ok on input the renderer cannot render.
   */
  const holed: unknown[] = [];
  holed[1] = { quantity: 2, discountPercent: 10, highlight: false };
  const r = validateBlockSpec({ type: "bundle_tiers", tiers: holed } as unknown as BlockSpecInput);
  assert.equal(r.ok, false, "the hole was skipped instead of refused");

  const holedRows: unknown[] = [];
  holedRows[2] = { label: "Material", value: "Brass" };
  assert.equal(
    validateBlockSpec({ type: "spec_table", rows: holedRows } as unknown as BlockSpecInput).ok,
    false,
  );
});
