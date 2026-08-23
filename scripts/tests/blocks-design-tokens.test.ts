import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDesignTokens,
  type RawTokenSample,
} from "../../lib/blocks/design-tokens";

/**
 * WP-B — the rule the whole product rests on: the block is styled with the
 * store's MEASURED design, and a value we couldn't measure is never quietly
 * replaced with a plausible one.
 *
 * The brief is explicit that this is what separates us from ChatGPT, which
 * invents colours and type and produces a snippet that looks wrong on the page.
 * So "we don't know" has to be a first-class outcome here, not something that
 * decays into a default nobody can see. Every value that didn't come from
 * getComputedStyle is listed in `fallbacks`, and WP-C shows that list to the
 * user as the fields to confirm.
 *
 * The second job is CSS integrity. These values are written into a `<style>`
 * block and — from WP-C — can be EDITED by the user before generation. A colour
 * or font-family carrying `}` or `<` would escape the scoped block and break
 * exactly the theme this feature promises not to touch. Anything that doesn't
 * normalize to a known-safe shape is refused.
 */

/** A sample shaped like a real Shopify theme's computed styles. */
const SAMPLE: RawTokenSample = {
  bodyBackground: "rgb(255, 255, 255)",
  bodyColor: "rgb(18, 18, 18)",
  bodyFontFamily: "Assistant, -apple-system, sans-serif",
  bodyFontSize: "16px",
  bodyFontWeight: "400",
  headingFontFamily: "'Playfair Display', Georgia, serif",
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

test("a fully measurable page yields tokens with nothing falling back", () => {
  const t = normalizeDesignTokens(SAMPLE);
  assert.equal(t.palette.pageBackground, "#ffffff");
  assert.equal(t.palette.textPrimary, "#121212");
  assert.equal(t.palette.accent, "#124a3d");
  assert.equal(t.palette.accentText, "#ffffff");
  assert.equal(t.shape.radiusPx, 8);
  assert.equal(t.shape.containerMaxWidthPx, 1200);
  assert.equal(t.type.baseSizePx, 16);
  assert.deepEqual(t.fallbacks, []);
});

test("the accent comes from the buy button, which is the store's own emphasis colour", () => {
  // Not the most-used colour on the page (that's usually the background) and
  // not a colour derived from the logo. The add-to-cart button is where the
  // store already decided "this is the thing to click".
  const t = normalizeDesignTokens({ ...SAMPLE, buttonBackground: "rgb(255, 90, 0)" });
  assert.equal(t.palette.accent, "#ff5a00");
});

test("a ghost buy button falls back to its border, not to a guess", () => {
  // Plenty of themes use an outlined button. Its background is transparent, but
  // the border IS the emphasis colour, so this is still a measurement.
  const t = normalizeDesignTokens({
    ...SAMPLE,
    buttonBackground: "rgba(0, 0, 0, 0)",
    buttonBorderColor: "rgb(200, 30, 60)",
  });
  assert.equal(t.palette.accent, "#c81e3c");
  assert.deepEqual(t.fallbacks, [], "a border colour is measured, not invented");
});

test("a button we truly couldn't read is recorded as a fallback, not hidden", () => {
  const t = normalizeDesignTokens({
    ...SAMPLE,
    buttonBackground: null,
    buttonBorderColor: null,
  });
  assert.ok(
    t.fallbacks.includes("palette.accent"),
    `expected accent in fallbacks, got ${JSON.stringify(t.fallbacks)}`,
  );
  // It still has to render, so a value exists — the point is that the UI is
  // told it's ours, not theirs.
  assert.match(t.palette.accent, /^#[0-9a-f]{6}$/);
});

test("button text we couldn't read is DERIVED for contrast and labelled as derived", () => {
  // Choosing black-or-white against a measured accent is arithmetic, not
  // invention — but the user still gets told, because a theme with a
  // deliberately low-contrast button would come out looking different.
  const dark = normalizeDesignTokens({
    ...SAMPLE,
    buttonBackground: "rgb(10, 10, 10)",
    buttonColor: null,
  });
  assert.equal(dark.palette.accentText, "#ffffff");

  const light = normalizeDesignTokens({
    ...SAMPLE,
    buttonBackground: "rgb(250, 240, 120)",
    buttonColor: null,
  });
  assert.equal(light.palette.accentText, "#000000");
  assert.ok(light.fallbacks.includes("palette.accentText"));
});

test("a fully transparent colour is not a colour", () => {
  for (const transparent of ["rgba(0, 0, 0, 0)", "transparent", "rgba(255,255,255,0)"]) {
    const t = normalizeDesignTokens({ ...SAMPLE, bodyBackground: transparent });
    assert.ok(
      t.fallbacks.includes("palette.pageBackground"),
      `${transparent} should not count as measured`,
    );
  }
});

test("a mostly-opaque colour is used; a barely-there one is not", () => {
  const opaque = normalizeDesignTokens({ ...SAMPLE, bodyColor: "rgba(20, 20, 20, 0.9)" });
  assert.equal(opaque.palette.textPrimary, "#141414");
  assert.ok(!opaque.fallbacks.includes("palette.textPrimary"));

  const faint = normalizeDesignTokens({ ...SAMPLE, bodyColor: "rgba(20, 20, 20, 0.2)" });
  assert.ok(faint.fallbacks.includes("palette.textPrimary"));
});

test("square corners are a real measurement and must not become rounded", () => {
  // The tempting bug: treat 0 as falsy, fall back to a friendly 8px, and hand a
  // brutalist store a block with rounded corners it never uses.
  const t = normalizeDesignTokens({ ...SAMPLE, buttonBorderRadius: "0px" });
  assert.equal(t.shape.radiusPx, 0);
  assert.deepEqual(t.fallbacks, []);
});

test("a multi-value border-radius collapses to its dominant corner", () => {
  const t = normalizeDesignTokens({ ...SAMPLE, buttonBorderRadius: "12px 12px 0px 0px" });
  assert.equal(t.shape.radiusPx, 12);
});

test("a pill button's huge radius is clamped to something a card can use", () => {
  // `border-radius: 9999px` on a button is a pill. Applied to a full-width
  // block it would bow the edges into a lozenge.
  const t = normalizeDesignTokens({ ...SAMPLE, buttonBorderRadius: "9999px" });
  assert.ok(t.shape.radiusPx <= 32, `got ${t.shape.radiusPx}`);
});

test("an unbounded container width falls back and says so", () => {
  const t = normalizeDesignTokens({ ...SAMPLE, containerMaxWidth: "none" });
  assert.ok(t.fallbacks.includes("shape.containerMaxWidthPx"));
  assert.ok(t.shape.containerMaxWidthPx > 0);
});

test("font stacks are kept whole, because the first name may not be installed", () => {
  const t = normalizeDesignTokens(SAMPLE);
  assert.equal(t.type.bodyFamily, "Assistant, -apple-system, sans-serif");
  assert.equal(t.type.headingFamily, "'Playfair Display', Georgia, serif");
});

test("a font-family that could break out of our style block is refused", () => {
  // These values round-trip through the database and become user-editable in
  // WP-C, so they are untrusted by the time they're written into CSS.
  for (const hostile of [
    "Arial; } body { display: none } .x {",
    "Arial</style><script>alert(1)</script>",
    "Arial\n} * { color: red }",
  ]) {
    const t = normalizeDesignTokens({ ...SAMPLE, bodyFontFamily: hostile });
    assert.ok(
      t.fallbacks.includes("type.bodyFamily"),
      `${hostile} should be refused`,
    );
    assert.ok(
      !/[<>{}();]/.test(t.type.bodyFamily),
      `unsafe characters survived: ${t.type.bodyFamily}`,
    );
  }
});

test("every colour that reaches the output is a plain 6-digit hex", () => {
  const t = normalizeDesignTokens({
    ...SAMPLE,
    bodyBackground: "color(display-p3 0.1 0.2 0.3)", // modern CSS we don't parse
    buttonBackground: "url(#gradient)",
  });
  for (const [name, value] of Object.entries(t.palette)) {
    assert.match(value, /^#[0-9a-f]{6}$/, `${name} = ${value}`);
  }
});

test("an absurd base font size is refused rather than scaling the whole block", () => {
  for (const bad of ["0px", "400px", "-3px", "inherit"]) {
    const t = normalizeDesignTokens({ ...SAMPLE, bodyFontSize: bad });
    assert.ok(t.fallbacks.includes("type.baseSizePx"), `${bad} should fall back`);
    assert.ok(t.type.baseSizePx >= 10 && t.type.baseSizePx <= 32);
  }
});

test("a missing heading font inherits the body font rather than inventing a pairing", () => {
  // Choosing a "complementary" display face is exactly the invention this
  // feature exists to avoid. Reusing the body stack is the conservative,
  // still-true answer.
  const t = normalizeDesignTokens({ ...SAMPLE, headingFontFamily: null });
  assert.equal(t.type.headingFamily, t.type.bodyFamily);
  assert.ok(t.fallbacks.includes("type.headingFamily"));
});

test("a shadow is carried through only when it's a real one", () => {
  assert.ok(normalizeDesignTokens(SAMPLE).shape.cardShadow);
  assert.equal(normalizeDesignTokens({ ...SAMPLE, cardShadow: "none" }).shape.cardShadow, null);
  assert.equal(
    normalizeDesignTokens({ ...SAMPLE, cardShadow: "red 0 0 0; } body {" }).shape.cardShadow,
    null,
    "an unparseable shadow is dropped, not sanitized into something arbitrary",
  );
});

test("a surface that equals the page background is still a surface", () => {
  // Many themes have no card colour at all. That's a measurement, not a gap.
  const t = normalizeDesignTokens({ ...SAMPLE, surfaceBackground: "rgb(255, 255, 255)" });
  assert.equal(t.palette.surface, "#ffffff");
  assert.ok(!t.fallbacks.includes("palette.surface"));
});

test("a dark store keeps its dark background instead of being lightened", () => {
  const t = normalizeDesignTokens({
    ...SAMPLE,
    bodyBackground: "rgb(10, 10, 12)",
    bodyColor: "rgb(240, 240, 240)",
    surfaceBackground: "rgb(24, 24, 27)",
  });
  assert.equal(t.palette.pageBackground, "#0a0a0c");
  assert.equal(t.palette.textPrimary, "#f0f0f0");
  assert.equal(t.palette.surface, "#18181b");
  assert.deepEqual(t.fallbacks, []);
});

test("text and its background are never left unreadable against each other", () => {
  // Measured live on liquiddeath.com: surface came back #000000 from a dark
  // card while the body's own colour also read as black, and the block rendered
  // black text on a black panel. Each token was individually a valid reading;
  // the COMBINATION was unusable, and nothing was checking the combination.
  //
  // The resolution keeps the store's colour and re-derives the one that has to
  // give — and says so, because a store whose real text colour we overrode
  // deserves to know.
  const t = normalizeDesignTokens({
    ...SAMPLE,
    bodyColor: "rgb(0, 0, 0)",
    bodyBackground: "rgb(0, 0, 0)",
    surfaceBackground: "rgb(0, 0, 0)",
  });
  assert.equal(t.palette.surface, "#000000", "the store's measured surface is kept");
  assert.notEqual(t.palette.textPrimary, "#000000", "text must not match its background");
  assert.ok(
    t.fallbacks.includes("palette.textPrimary"),
    "overriding a measured colour has to be disclosed",
  );
});

test("a legible pairing is left exactly as measured", () => {
  // The guard must not fire on normal stores — a contrast fix that rewrote
  // every palette would be its own kind of invention.
  for (const [bg, fg] of [
    ["rgb(255, 255, 255)", "rgb(18, 18, 18)"],
    ["rgb(10, 10, 12)", "rgb(240, 240, 240)"],
    ["rgb(245, 240, 230)", "rgb(60, 40, 20)"],
  ]) {
    const t = normalizeDesignTokens({
      ...SAMPLE,
      bodyBackground: bg,
      bodyColor: fg,
      surfaceBackground: bg,
    });
    assert.ok(
      !t.fallbacks.includes("palette.textPrimary"),
      `${fg} on ${bg} is legible and should have been left alone`,
    );
  }
});

test("the accent's own text stays readable on the accent", () => {
  // Same failure one layer down: a store whose button is dark grey with
  // near-black label text would give a badge nobody can read.
  const t = normalizeDesignTokens({
    ...SAMPLE,
    buttonBackground: "rgb(20, 20, 20)",
    buttonColor: "rgb(30, 30, 30)",
  });
  assert.notEqual(t.palette.accentText, "#1e1e1e");
  assert.ok(t.fallbacks.includes("palette.accentText"));
});

test("a shadow we never got to look at is declared unmeasured", () => {
  // `none` and "we found no card to read" are different facts. The first is the
  // store telling us it uses flat cards; the second is us not knowing. Only the
  // second belongs in fallbacks.
  const notFound = normalizeDesignTokens({ ...SAMPLE, cardShadow: null });
  assert.equal(notFound.shape.cardShadow, null);
  assert.ok(notFound.fallbacks.includes("shape.cardShadow"));

  const flat = normalizeDesignTokens({ ...SAMPLE, cardShadow: "none" });
  assert.equal(flat.shape.cardShadow, null);
  assert.ok(
    !flat.fallbacks.includes("shape.cardShadow"),
    "`none` is a measurement, not a gap",
  );
});

test("the border colour is derived from the measured palette, not picked", () => {
  // A hairline that's a blend of text and background sits correctly on both a
  // white and a near-black store. Picking `#e5e5e5` would vanish on the latter.
  const light = normalizeDesignTokens(SAMPLE);
  const dark = normalizeDesignTokens({
    ...SAMPLE,
    bodyBackground: "rgb(10, 10, 12)",
    bodyColor: "rgb(240, 240, 240)",
  });
  assert.notEqual(light.palette.border, dark.palette.border);
  assert.match(light.palette.border, /^#[0-9a-f]{6}$/);
  assert.match(dark.palette.border, /^#[0-9a-f]{6}$/);
});
