import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLiquidSnippet } from "../../lib/blocks/liquid-validate";
import { BLOCK_PREFIX } from "../../lib/blocks/render-block";

/**
 * WP-C — the gate on generated Liquid.
 *
 * The brief names the PROMPT as the technical guarantee that a block can't
 * break a theme ("el prompt debe exigir CSS scopeado… esa es la garantía
 * técnica"). A prompt is a request. This is the check, and it runs on every
 * snippet before anything is handed over — because the failure mode isn't a
 * malformed block, it's a merchant pasting a global `img { }` rule into a live
 * storefront and finding out from a customer.
 *
 * It fails CLOSED: anything it can't confidently read is rejected, and the
 * caller falls back to the deterministic template that produced the preview.
 * Rejecting a good snippet costs us a template; accepting a bad one costs the
 * merchant their product page.
 */

const GOOD = `
<div class="${BLOCK_PREFIX}">
  <style>
    .${BLOCK_PREFIX}{--ev-accent:#124a3d;background:#fff}
    .${BLOCK_PREFIX}__title{font-weight:600}
    @media (max-width:600px){.${BLOCK_PREFIX}__title{font-size:1em}}
  </style>
  <h3 class="${BLOCK_PREFIX}__title">{{ product.title }}</h3>
  <p>{{ product.price | money }}</p>
</div>
`.trim();

test("a properly scoped snippet is accepted", () => {
  const res = validateLiquidSnippet(GOOD);
  assert.equal(res.ok, true, res.ok ? "" : res.problems.join(" | "));
});

test("a global element selector is rejected, naming the selector", () => {
  // The one that actually causes damage: every storefront has these.
  for (const selector of ["img", "body", "button", ".price", "*", "a"]) {
    const snippet = GOOD.replace(
      `.${BLOCK_PREFIX}__title{font-weight:600}`,
      `${selector}{font-weight:600}`,
    );
    const res = validateLiquidSnippet(snippet);
    assert.equal(res.ok, false, `${selector} was accepted`);
    if (res.ok) continue;
    assert.ok(
      res.problems.some((p) => p.includes(selector)),
      `the rejection should name "${selector}": ${res.problems.join(" | ")}`,
    );
  }
});

test("a selector that merely CONTAINS the prefix but doesn't start with it is rejected", () => {
  // `body .ev-blk` styles the block, but its specificity war is with the theme
  // and it drags `body` into our matching. Only descendants OF the block count.
  const snippet = GOOD.replace(
    `.${BLOCK_PREFIX}__title{font-weight:600}`,
    `body .${BLOCK_PREFIX}__title{font-weight:600}`,
  );
  assert.equal(validateLiquidSnippet(snippet).ok, false);
});

test("script tags are rejected outright", () => {
  // We are handing a merchant code to paste into their theme. Nothing we
  // generate needs to execute, so anything that does is either a model
  // hallucination or worse.
  const res = validateLiquidSnippet(GOOD.replace("</style>", "</style><script>x()</script>"));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.problems.some((p) => /script/i.test(p)));
});

test("external resources are rejected", () => {
  for (const bad of [
    `<style>@import url(https://evil/x.css);</style>`,
    `<link rel="stylesheet" href="https://evil/x.css">`,
    `<style>.${BLOCK_PREFIX}{background:url(https://tracker/x.png)}</style>`,
    `<iframe src="https://evil"></iframe>`,
  ]) {
    const res = validateLiquidSnippet(GOOD.replace("</style>", `</style>${bad}`));
    assert.equal(res.ok, false, bad);
  }
});

test("a snippet with no style block at all is rejected", () => {
  // A block with no CSS inherits whatever the theme does to a bare div, which
  // is precisely the "looks foreign on the page" outcome this feature exists to
  // prevent. It also means the model ignored the tokens.
  const res = validateLiquidSnippet(
    `<div class="${BLOCK_PREFIX}"><h3>{{ product.title }}</h3></div>`,
  );
  assert.equal(res.ok, false);
});

test("a snippet whose root isn't the block prefix is rejected", () => {
  const res = validateLiquidSnippet(GOOD.replace(`class="${BLOCK_PREFIX}"`, 'class="wrapper"'));
  assert.equal(res.ok, false);
});

test("Liquid tags the theme needs are left alone", () => {
  // The output IS Liquid — objects, filters and control flow all have to
  // survive. A validator that stripped or rejected them would defeat the point.
  const snippet = GOOD.replace(
    "<p>{{ product.price | money }}</p>",
    `{% if product.available %}<p>{{ product.price | money }}</p>{% endif %}
     {% for v in product.variants %}<span>{{ v.title }}</span>{% endfor %}`,
  );
  assert.equal(validateLiquidSnippet(snippet).ok, true);
});

test("a Liquid tag that reaches outside the snippet is rejected", () => {
  // `{% render %}` and friends pull in theme files, which makes the block's
  // behaviour depend on code we never saw and can't promise anything about.
  for (const tag of [
    "{% render 'something' %}",
    "{% include 'legacy' %}",
    "{% section 'header' %}",
    "{% javascript %}alert(1){% endjavascript %}",
  ]) {
    const res = validateLiquidSnippet(GOOD.replace("</div>", `${tag}</div>`));
    assert.equal(res.ok, false, tag);
  }
});

test("an on* event attribute is rejected", () => {
  const res = validateLiquidSnippet(
    GOOD.replace(`<h3 class="${BLOCK_PREFIX}__title">`, `<h3 onclick="x()" class="${BLOCK_PREFIX}__title">`),
  );
  assert.equal(res.ok, false);
});

test("the validator reports every problem it finds, not just the first", () => {
  // The caller retries the model once with the problems fed back in, so a list
  // that stops at the first issue makes the retry a guessing game.
  const bad = `<div class="${BLOCK_PREFIX}"><style>img{width:1px}body{color:red}</style><script>x</script></div>`;
  const res = validateLiquidSnippet(bad);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.ok(res.problems.length >= 2, res.problems.join(" | "));
});

test("an empty or absurd snippet is rejected rather than throwing", () => {
  for (const snippet of ["", "   ", "not html at all", "x".repeat(200_000)]) {
    const res = validateLiquidSnippet(snippet);
    assert.equal(res.ok, false, JSON.stringify(snippet.slice(0, 20)));
  }
});
