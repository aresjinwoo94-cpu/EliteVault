import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyTokenOverrides,
  normalizeDesignTokens,
  type RawTokenSample,
} from "../../lib/blocks/design-tokens";

/**
 * WP-C — the user correcting what we measured.
 *
 * The brief asks for this directly: show the detected tokens and let the
 * merchant fix them before anything is generated. It's the designed remedy for
 * the stores where we genuinely can't read the buy button — measured on real
 * storefronts, that's a meaningful share of them.
 *
 * Two things are being tested. The first is boring and essential: these values
 * are typed by a user and written verbatim into a <style> block, so they are
 * untrusted input at a CSS injection point. The second is the honest one: a
 * value the merchant corrected is no longer OUR guess, so it has to leave
 * `fallbacks` — otherwise the UI keeps asking them to confirm something they
 * just told us.
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
  buttonBackground: null,
  buttonColor: null,
  buttonBorderRadius: "8px",
  buttonBorderColor: null,
  containerMaxWidth: "1200px",
  cardShadow: "none",
  surfaceBackground: "rgb(250,250,250)",
};

/** Measured on a store whose buy button we couldn't find — accent is ours. */
const MEASURED = normalizeDesignTokens(RAW);

test("the fixture is the case this feature exists for", () => {
  assert.ok(MEASURED.fallbacks.includes("palette.accent"));
});

test("a corrected colour is used, and stops being listed as our guess", () => {
  const t = applyTokenOverrides(MEASURED, { "palette.accent": "#ff5a00" });
  assert.equal(t.palette.accent, "#ff5a00");
  assert.ok(
    !t.fallbacks.includes("palette.accent"),
    "a value the merchant supplied is not a fallback any more",
  );
  assert.ok(t.userCorrected.includes("palette.accent"));
});

test("correcting one token doesn't quietly clear the others", () => {
  const t = applyTokenOverrides(MEASURED, { "palette.accent": "#ff5a00" });
  assert.ok(t.fallbacks.includes("palette.accentText"), t.fallbacks.join(", "));
});

test("a colour that isn't a colour is refused, leaving the measurement in place", () => {
  // These land in a <style> block verbatim. Anything that isn't unambiguously a
  // hex triplet is refused rather than sanitized into something arbitrary.
  for (const hostile of [
    "red; } body { display:none } .x {",
    "url(https://tracker/x.png)",
    "expression(alert(1))",
    "#ff5a0",
    "rgb(255,90,0)",
    "",
    "#gggggg",
  ]) {
    const t = applyTokenOverrides(MEASURED, { "palette.accent": hostile });
    assert.equal(t.palette.accent, MEASURED.palette.accent, `accepted: ${hostile}`);
    assert.ok(!t.userCorrected.includes("palette.accent"), `accepted: ${hostile}`);
  }
});

test("a three-digit hex is expanded rather than refused", () => {
  // Every colour picker emits six digits, but people paste #fff by hand.
  const t = applyTokenOverrides(MEASURED, { "palette.accent": "#F0A" });
  assert.equal(t.palette.accent, "#ff00aa");
});

test("a corrected font stack must still be safe to write into CSS", () => {
  const good = applyTokenOverrides(MEASURED, { "type.bodyFamily": "Inter, sans-serif" });
  assert.equal(good.type.bodyFamily, "Inter, sans-serif");

  for (const hostile of ["Inter; } * { color:red }", "Inter</style><script>x</script>"]) {
    const t = applyTokenOverrides(MEASURED, { "type.bodyFamily": hostile });
    assert.equal(t.type.bodyFamily, MEASURED.type.bodyFamily, hostile);
  }
});

test("numeric tokens are clamped to what a block can actually use", () => {
  assert.equal(applyTokenOverrides(MEASURED, { "shape.radiusPx": "999" }).shape.radiusPx, 32);
  assert.equal(applyTokenOverrides(MEASURED, { "shape.radiusPx": "-5" }).shape.radiusPx, 0);
  assert.equal(applyTokenOverrides(MEASURED, { "shape.radiusPx": "12" }).shape.radiusPx, 12);
  assert.equal(applyTokenOverrides(MEASURED, { "type.baseSizePx": "400" }).type.baseSizePx, 32);
  assert.equal(applyTokenOverrides(MEASURED, { "shape.radiusPx": "abc" }).shape.radiusPx, MEASURED.shape.radiusPx);
});

test("zero is a legitimate correction, not an empty field", () => {
  // Someone with a brutalist theme correcting the rounding to 0 must not have
  // it read as "no answer given".
  const t = applyTokenOverrides(MEASURED, { "shape.radiusPx": "0" });
  assert.equal(t.shape.radiusPx, 0);
  assert.ok(t.userCorrected.includes("shape.radiusPx"));
});

test("correcting the panel colour re-derives everything that hangs off it", () => {
  // `inset` and `border` are computed FROM surface and text. Leaving them at
  // their old values after a correction is how a merchant ends up with a
  // hand-picked panel and hairlines from the colour it replaced.
  const t = applyTokenOverrides(MEASURED, { "palette.surface": "#101014" });
  assert.equal(t.palette.surface, "#101014");
  assert.notEqual(t.palette.inset, MEASURED.palette.inset);
  assert.notEqual(t.palette.border, MEASURED.palette.border);
});

test("a correction that makes the block unreadable is still applied", () => {
  // Deliberate: the automatic repair exists because WE might have measured two
  // colours that fight. If the merchant explicitly picks both, that's their
  // design decision on their own storefront, and silently overruling it would
  // be the same overreach this feature is built to avoid. The UI warns instead.
  const t = applyTokenOverrides(MEASURED, {
    "palette.surface": "#000000",
    "palette.textPrimary": "#050505",
  });
  assert.equal(t.palette.surface, "#000000");
  assert.equal(t.palette.textPrimary, "#050505");
  assert.ok(
    t.warnings.some((w) => /hard to read|contrast/i.test(w)),
    t.warnings.join(", "),
  );
});

test("unknown keys are ignored rather than merged in", () => {
  const t = applyTokenOverrides(MEASURED, {
    "palette.nonsense": "#ff0000",
    "__proto__": "polluted",
  } as Record<string, string>);
  assert.equal((t.palette as unknown as Record<string, unknown>).nonsense, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("no overrides means the measurement is returned untouched", () => {
  const t = applyTokenOverrides(MEASURED, {});
  assert.deepEqual(t.palette, MEASURED.palette);
  assert.deepEqual(t.fallbacks, MEASURED.fallbacks);
  assert.deepEqual(t.userCorrected, []);
});
