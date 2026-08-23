import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_CATALOG,
  validateBlockSpec,
  type BlockSpecInput,
} from "../../lib/blocks/catalog";

/**
 * WP-C — the truthfulness gate.
 *
 * The brief's hard rule: a block that carries CLAIMS is never autofilled with
 * invented data. "Free shipping in 3 days", "2-year warranty", "we beat them on
 * price" — none of that is knowable from a product endpoint, and a generator
 * that guesses at it produces a store page that lies to shoppers. So every
 * claim-bearing field is required from the user, and a spec missing one is
 * REFUSED rather than completed.
 *
 * The refusal has to name what's missing, because the UI turns that list into
 * the fields it asks for. A generic "invalid" would leave the user guessing.
 *
 * Note what is NOT validated here: whether the user's claims are TRUE. We can't
 * know that. What we can guarantee is that every claim in the output came from
 * the merchant, who can be held to it, rather than from us.
 */

const TRUST: BlockSpecInput = {
  type: "trust_icons",
  items: [
    { icon: "shipping", label: "Free shipping", detail: "Arrives in 3-5 days" },
    { icon: "warranty", label: "2-year warranty", detail: "Covers manufacturing defects" },
  ],
};

const CARDS: BlockSpecInput = {
  type: "brand_cards",
  promise: "Rings that outlive the trend cycle.",
  benefits: ["Solid brass, not plated", "Hand-finished in Lisbon", "Free resizing for life"],
  logoUrl: null,
};

const COMPARISON: BlockSpecInput = {
  type: "comparison",
  competitorName: "Typical high-street ring",
  rows: [
    { label: "Price", ours: "$89", theirs: "$140", weWin: true },
    { label: "Material", ours: "Solid brass", theirs: "Plated steel", weWin: true },
    { label: "Delivery", ours: "3-5 days", theirs: "Next day", weWin: false },
  ],
};

const STATS: BlockSpecInput = {
  type: "product_stats",
  stats: [
    { label: "Repeat buyers", value: "38", unit: "%" },
    { label: "Average rating", value: "4.8", unit: "/5" },
  ],
};

test("a fully-supplied spec of each type is accepted", () => {
  for (const spec of [TRUST, CARDS, COMPARISON, STATS]) {
    const res = validateBlockSpec(spec);
    assert.equal(res.ok, true, `${spec.type}: ${res.ok ? "" : res.missing.join(", ")}`);
  }
});

test("every catalogue entry declares what it needs from the user", () => {
  // The UI builds its forms from this. An entry that needed data but didn't say
  // so would silently render an empty block.
  for (const entry of BLOCK_CATALOG) {
    assert.ok(entry.id, "missing id");
    assert.ok(entry.name.length > 0, `${entry.id} has no name`);
    assert.ok(
      entry.requires.length > 0,
      `${entry.id} claims to need nothing from the user — every MVP block carries claims`,
    );
  }
});

test("a trust block with no items is refused, not filled in with the usual four", () => {
  // The tempting bug: default to "Free shipping / Secure payment / Easy returns
  // / Warranty" because every store has those. Most stores do NOT have all
  // four, and putting them on a product page is a promise the merchant never
  // made.
  const res = validateBlockSpec({ type: "trust_icons", items: [] });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.missing.some((m) => /item/i.test(m)), res.missing.join(", "));
});

test("a trust item without a label is refused", () => {
  const res = validateBlockSpec({
    type: "trust_icons",
    items: [{ icon: "shipping", label: "   ", detail: "" }],
  });
  assert.equal(res.ok, false);
});

test("a trust item may omit its detail line — only the claim itself is required", () => {
  const res = validateBlockSpec({
    type: "trust_icons",
    items: [{ icon: "returns", label: "30-day returns", detail: "" }],
  });
  assert.equal(res.ok, true);
});

test("a comparison with no named competitor is refused", () => {
  // "vs. the others" is a claim about someone. It needs a subject the merchant
  // chose, both because it's honest and because it's their legal exposure.
  const res = validateBlockSpec({ ...COMPARISON, competitorName: "" } as BlockSpecInput);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.missing.some((m) => /competitor/i.test(m)));
});

test("a comparison row missing either side is refused", () => {
  for (const rows of [
    [{ label: "Price", ours: "$89", theirs: "", weWin: true }],
    [{ label: "Price", ours: "", theirs: "$140", weWin: true }],
    [{ label: "", ours: "$89", theirs: "$140", weWin: true }],
  ]) {
    const res = validateBlockSpec({ ...COMPARISON, rows } as BlockSpecInput);
    assert.equal(res.ok, false, JSON.stringify(rows));
  }
});

test("a comparison where we win every single row is still allowed, but flagged", () => {
  // Not refused — it may be true. But a table where the competitor loses
  // everything reads as marketing rather than comparison, and the UI should say
  // so before the merchant publishes it.
  const res = validateBlockSpec({
    ...COMPARISON,
    rows: COMPARISON.type === "comparison" ? COMPARISON.rows.map((r) => ({ ...r, weWin: true })) : [],
  } as BlockSpecInput);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.ok(res.warnings.some((w) => /every row/i.test(w)), res.warnings.join(", "));
});

test("a stats block with no numbers is refused — this is the block that isn't offered", () => {
  // The brief singles this one out: "los números reales; si no los da, ese
  // bloque no se ofrece (no se inventa)".
  const res = validateBlockSpec({ type: "product_stats", stats: [] });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.missing.some((m) => /number|stat/i.test(m)), res.missing.join(", "));
});

test("a stat whose value isn't a number is refused", () => {
  // "Loved by everyone" is not a statistic. A stats block exists to show
  // figures; letting prose in makes it a claims block wearing a chart's clothes.
  for (const value of ["lots", "", "  ", "many"]) {
    const res = validateBlockSpec({
      type: "product_stats",
      stats: [{ label: "Repeat buyers", value, unit: "%" }],
    });
    assert.equal(res.ok, false, `value=${JSON.stringify(value)}`);
  }
});

test("a brand block needs a promise and at least three benefits", () => {
  assert.equal(validateBlockSpec({ ...CARDS, promise: "" } as BlockSpecInput).ok, false);
  assert.equal(
    validateBlockSpec({ ...CARDS, benefits: ["Only one"] } as BlockSpecInput).ok,
    false,
  );
});

test("an over-long field is refused rather than silently truncated", () => {
  // Truncation would publish half a sentence on the merchant's storefront.
  const res = validateBlockSpec({
    ...CARDS,
    promise: "x".repeat(500),
  } as BlockSpecInput);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.missing.some((m) => /too long/i.test(m)), res.missing.join(", "));
});

test("a logo must be an https URL if given at all", () => {
  for (const logoUrl of ["javascript:alert(1)", "http://insecure/logo.png", "not a url"]) {
    assert.equal(
      validateBlockSpec({ ...CARDS, logoUrl } as BlockSpecInput).ok,
      false,
      logoUrl,
    );
  }
  assert.equal(
    validateBlockSpec({ ...CARDS, logoUrl: "https://cdn.example/logo.png" } as BlockSpecInput).ok,
    true,
  );
});

test("a spec with an unknown or missing type is refused, not waved through", () => {
  // The switch had no default, so an unrecognised type validated clean, was
  // persisted, and then rendered as a DIFFERENT block — the merchant approves
  // one thing and their theme gets another. A validator's job is to fail
  // closed on input it doesn't understand.
  for (const bad of [
    { type: "totally_unknown" },
    { items: [] },
    {},
    { type: null },
  ]) {
    const res = validateBlockSpec(bad as unknown as BlockSpecInput);
    assert.equal(res.ok, false, JSON.stringify(bad));
  }
});

test("a malformed item is refused instead of crashing the renderer", () => {
  // The client forms always send every key, so these are only reachable by a
  // crafted call — but a server action is a public endpoint that accepts
  // arbitrary JSON, and each of these either threw inside the renderer or
  //500'd the validator itself.
  const cases: unknown[] = [
    { type: "trust_icons", items: [null] },
    { type: "comparison", competitorName: "Them", rows: [null] },
    { type: "brand_cards", promise: "p", benefits: ["a", "b", 5], logoUrl: null },
    { type: "product_stats", stats: [{ label: "Buyers", value: "38", unit: 7 }] },
  ];
  for (const bad of cases) {
    let res: ReturnType<typeof validateBlockSpec>;
    assert.doesNotThrow(() => {
      res = validateBlockSpec(bad as BlockSpecInput);
    }, JSON.stringify(bad));
    res = validateBlockSpec(bad as BlockSpecInput);
    assert.equal(res.ok, false, JSON.stringify(bad));
  }
});

test("an omitted optional key is accepted — it's a blank field, not a broken one", () => {
  // The distinction the previous version of this test got wrong: `detail` and
  // `unit` are optional, so leaving them out is an answer. What must not happen
  // is the renderer throwing on the `undefined` that results, which it did.
  for (const spec of [
    { type: "trust_icons", items: [{ icon: "shipping", label: "Free shipping" }] },
    { type: "product_stats", stats: [{ label: "Repeat buyers", value: "38" }] },
  ]) {
    const res = validateBlockSpec(spec as unknown as BlockSpecInput);
    assert.equal(res.ok, true, JSON.stringify(spec));
  }
});

test("an icon outside the known set is refused rather than silently swapped", () => {
  // An unrecognised name fell back to the shipping truck, so "Made in Italy"
  // rendered next to a delivery van — a signal the merchant never chose.
  const res = validateBlockSpec({
    type: "trust_icons",
    items: [{ icon: "made-in-italy", label: "Made in Italy", detail: "" }],
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.missing.some((m) => /icon/i.test(m)), res.missing.join(", "));
});

test("Liquid delimiters are refused in the merchant's own text", () => {
  // Defence in depth with the renderer's escaping: refusing here means the
  // merchant is TOLD, rather than quietly having their braces neutralised and
  // wondering why the page shows them literally.
  for (const promise of [
    "{% for i in (1..3) %}",
    "{{ customer.email }}",
    "Save {%- assign x = 1 -%} now",
  ]) {
    const res = validateBlockSpec({
      type: "brand_cards",
      promise,
      benefits: ["a", "b", "c"],
      logoUrl: null,
    });
    assert.equal(res.ok, false, promise);
    if (res.ok) continue;
    assert.ok(res.missing.some((m) => /liquid|\{%|\{\{/i.test(m)), res.missing.join(", "));
  }
});

test("validation never returns a spec with fields the user didn't supply", () => {
  // The guarantee in one assertion: whatever comes out is what went in.
  const res = validateBlockSpec(TRUST);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.spec, TRUST);
});
