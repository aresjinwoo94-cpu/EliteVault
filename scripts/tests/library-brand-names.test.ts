import { test } from "node:test";
import assert from "node:assert/strict";
import { matchBrand } from "../../lib/library/store-check";

const pad = " ".repeat(600);

test("a brand known by two names matches either (Athletic Greens (AG1)); the wrong domain still fails", () => {
  assert.equal(matchBrand(`<title>AG1 Official | More Than A Greens Powder</title>${pad}`, "Athletic Greens (AG1)", "athleticgreens.com").match, true);
  assert.equal(matchBrand(`<title>Official Athletics Website | MLB.com</title>${pad}`, "Athletic Greens (AG1)", "athletics.com").match, false);
});

test("every brand word in the page title is enough (Sundays for Dogs ⊂ Sundays Food for Dogs)", () => {
  assert.equal(matchBrand(`<title>Air-Dried Dog Food Delivery | Sundays Food for Dogs</title>${pad}`, "Sundays for Dogs", "sundaysfordogs.com").match, true);
});
