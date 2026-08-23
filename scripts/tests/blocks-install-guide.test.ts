import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installGuide,
  installGuideText,
} from "../../lib/blocks/install-instructions";
import { BLOCK_CATALOG } from "../../lib/blocks/catalog";

/**
 * WP-C — the install guide is a deliverable, so it gets checked like one.
 *
 * The brief is specific about the reader: "redactadas para alguien que NO sabe
 * editar Liquid". Someone in that position is being asked to edit a file on a
 * live storefront, which is a genuinely frightening thing to do, and the
 * difference between a guide they follow and one they abandon is whether it
 * tells them how to get back.
 *
 * These assertions are about the promises the guide has to keep, not its
 * wording — the prose can be rewritten freely as long as a backup comes first
 * and a way out comes at all.
 */

const ALL_TYPES = [...BLOCK_CATALOG.map((b) => b.id), "product_facts" as const];

test("every block type has a guide", () => {
  for (const type of ALL_TYPES) {
    const guide = installGuide(type);
    assert.ok(guide.steps.length >= 4, `${type}: only ${guide.steps.length} steps`);
    assert.ok(guide.removal.length > 0, `${type}: no removal instructions`);
    assert.ok(guide.safety.length > 0, `${type}: nothing reassuring said`);
  }
});

test("the very first step is taking a backup", () => {
  // Before touching a live theme, not after. A merchant who reads step 1 and
  // knows they can revert will actually try this; one who discovers the risk at
  // step 5 closes the tab.
  for (const type of ALL_TYPES) {
    const first = installGuide(type).steps[0].toLowerCase();
    assert.ok(
      /duplicate|backup|copy/.test(first),
      `${type}: step 1 doesn't start with a backup — "${first.slice(0, 60)}…"`,
    );
  }
});

test("the guide always says how to undo it", () => {
  for (const type of ALL_TYPES) {
    const removal = installGuide(type).removal.toLowerCase();
    assert.ok(/delete|remove/.test(removal), type);
    assert.ok(/save/.test(removal), `${type}: doesn't say to save after deleting`);
  }
});

test("it names the file a merchant will actually be looking at", () => {
  // "Edit your product template" is useless to someone who has never opened
  // the code editor. The real filename is the difference.
  const steps = installGuide("trust_icons").steps.join(" ");
  assert.ok(steps.includes("main-product.liquid"), steps);
  assert.ok(/Edit code/i.test(steps), "the admin path isn't named");
});

test("each block's guide says where THAT block belongs", () => {
  // Trust icons go under the buy button; a comparison table goes under the
  // description. A guide that gave the same location for both would put a
  // comparison table between the price and the Add to cart button.
  const trust = installGuide("trust_icons").steps.join(" ");
  const comparison = installGuide("comparison").steps.join(" ");
  assert.notEqual(trust, comparison);
  assert.ok(/add to cart/i.test(trust), trust);
  assert.ok(/description/i.test(comparison), comparison);
});

test("the plain-text form keeps every step, in order", () => {
  // It's copied alongside the snippet, so a step lost in the flattening is a
  // step the merchant never sees.
  const guide = installGuide("brand_cards");
  const text = installGuideText("brand_cards");
  guide.steps.forEach((step, i) => {
    assert.ok(text.includes(`${i + 1}. ${step}`), `step ${i + 1} missing from the text form`);
  });
  assert.ok(text.includes(guide.removal));
});
