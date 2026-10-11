import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_TOOL_SCHEMA,
  ANALYSIS_TOOL_SCHEMA_WITH_PALETTE,
  AnalysisResultSchema,
  FixTrackFixSchema,
  ObservedPaletteSchema,
} from "../../ai/schemas";
import {
  decideAccess,
  gateFixes,
  parseNicheWinners,
  parseState,
  pickCompetitor,
  sanitizeFixes,
  type FixTracksState,
} from "../../lib/analyzer/fix-tracks";
import { SHOPIFY_THEMES, themeBySlug } from "../../lib/analyzer/shopify-themes";

const HAY = "acmeboots.com Leather boots page. The hero CTA says Add to cart but the price 129 is below the fold. Palette #1a1a1a #c8a165";

const fix = (over: Record<string, unknown> = {}) => ({
  title: "Offer a care kit right after checkout",
  impact: "high",
  effort: "S",
  why: "Boots are a one-off purchase, a complement raises ticket.",
  evidence: "Leather boots page shows no bundle or care product near the CTA.",
  ...over,
});

// ── schema / sanitising (§3.6) ──────────────────────────────────────────

test("a fix without evidence is rejected by the schema and dropped", () => {
  assert.equal(FixTrackFixSchema.safeParse(fix({ evidence: undefined })).success, false);
  assert.equal(FixTrackFixSchema.safeParse(fix({ evidence: "short" })).success, false);
  assert.deepEqual(
    sanitizeFixes([fix({ evidence: undefined }), fix({ evidence: "" })], { track: "post_purchase", haystack: HAY }),
    [],
  );
});

test("evidence that shares nothing with THIS store is dropped (generic)", () => {
  const out = sanitizeFixes([fix({ evidence: "Many stores benefit from a loyalty programme overall." })], {
    track: "post_purchase",
    haystack: HAY,
  });
  assert.deepEqual(out, []);
});

test("generic filler and invented % / $ figures are dropped", () => {
  const opts = { track: "post_purchase" as const, haystack: HAY };
  assert.deepEqual(sanitizeFixes([fix({ title: "Boost sales with a leather boots upsell" })], opts), []);
  assert.deepEqual(sanitizeFixes([fix({ why: "Lifts revenue by 25% on leather boots." })], opts), []);
  assert.deepEqual(sanitizeFixes([fix({ why: "Adds $40 per order on the boots page." })], opts), []);
  assert.equal(sanitizeFixes([fix()], opts).length, 1);
});

test("theme_slug outside the closed list drops the fix; a listed slug is kept", () => {
  const opts = { track: "theme_colors" as const, haystack: HAY };
  assert.deepEqual(sanitizeFixes([fix({ theme_slug: "totally-made-up" })], opts), []);
  const kept = sanitizeFixes([fix({ theme_slug: "Dawn" })], opts);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].theme_slug, "dawn");
  // A fix that names no theme is fine; theme_slug is stripped on other tracks.
  assert.equal(sanitizeFixes([fix()], opts)[0].theme_slug, undefined);
  assert.equal(sanitizeFixes([fix({ theme_slug: "dawn" })], { track: "post_purchase", haystack: HAY })[0].theme_slug, undefined);
});

test("theme_slug null or empty is treated as absent, not a rejection", () => {
  const opts = { track: "theme_colors" as const, haystack: HAY };
  assert.equal(sanitizeFixes([fix({ theme_slug: null })], opts).length, 1);
  assert.equal(sanitizeFixes([fix({ theme_slug: "" })], opts).length, 1);
});

test("at most 3 fixes survive", () => {
  const many = Array.from({ length: 6 }, (_, i) => fix({ title: `Boots upsell number ${i}` }));
  assert.equal(sanitizeFixes(many, { track: "post_purchase", haystack: HAY }).length, 3);
});

test("the theme list is closed, unique, free and points at themes.shopify.com", () => {
  const slugs = SHOPIFY_THEMES.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const t of SHOPIFY_THEMES) {
    assert.match(t.url, new RegExp(`^https://themes\\.shopify\\.com/themes/${t.slug}$`));
    assert.equal(t.price, "free");
  }
  assert.equal(themeBySlug("nope"), null);
  assert.equal(themeBySlug("horizon")?.name, "Horizon");
});

// ── gating (§3.4) ───────────────────────────────────────────────────────

const empty: FixTracksState = { free_choice: null, tracks: {} };

test("free and anonymous pick ONE track; any other is locked; paid opens all", () => {
  for (const v of ["free", "anon"] as const) {
    assert.deepEqual(decideAccess(v, "competitor", empty), { kind: "choose" });
    const chosen: FixTracksState = { free_choice: "competitor", tracks: {} };
    assert.deepEqual(decideAccess(v, "competitor", chosen), { kind: "serve" });
    assert.deepEqual(decideAccess(v, "post_purchase", chosen), { kind: "locked", choice: "competitor" });
    // urgent is never locked and never "chosen": its fixes ship with the audit (no AI, nothing to spend)
    assert.deepEqual(decideAccess(v, "urgent", chosen), { kind: "serve" });
    assert.deepEqual(decideAccess(v, "urgent", empty), { kind: "serve" });
  }
  assert.deepEqual(decideAccess("paid", "theme_colors", { free_choice: "urgent", tracks: {} }), { kind: "serve" });
});

test("free/anon get fix #1 in full and fixes #2+ stripped to title only (server-side)", () => {
  const fixes = sanitizeFixes(
    [fix({ title: "Boots upsell one" }), fix({ title: "Boots upsell two" }), fix({ title: "Boots upsell three" })],
    { track: "post_purchase", haystack: HAY },
  );
  const gated = gateFixes(fixes, "free");
  assert.equal(gated[0].evidence !== undefined, true);
  for (const g of gated.slice(1)) {
    assert.equal(g.locked, true);
    assert.equal(g.why, undefined);
    assert.equal(g.evidence, undefined);
  }
  assert.equal(gateFixes(fixes, "paid").every((g) => g.evidence !== undefined), true);
});

test("parseState tolerates garbage", () => {
  assert.deepEqual(parseState(null), empty);
  assert.deepEqual(parseState({ free_choice: "hack", competitor: "x" }).free_choice, null);
  // a pick of "urgent" made under the old rule counts as nothing spent
  assert.equal(parseState({ free_choice: "urgent" }).free_choice, null);
  assert.equal(parseState({ free_choice: "theme_colors" }).free_choice, "theme_colors");
});

// ── competitor selection (§3.3) ─────────────────────────────────────────

const w = (domain: string, over: Record<string, unknown> = {}) => ({
  title: domain,
  domain,
  url: `https://${domain}`,
  exactMatch: true,
  activeAds: 3,
  revenue: { low: 1, high: 10 },
  ...over,
});

test("competitor = same-niche winner WITH teardown; ties by revenue then ads; never another niche", () => {
  const td = new Map<string, string>([["a.com", "t"], ["b.com", "t"], ["off.com", "t"]]);
  const winners = parseNicheWinners({
    scope: "niche",
    winners: [w("a.com", { revenue: { low: 1, high: 5 } }), w("b.com", { revenue: { low: 1, high: 50 } }), w("off.com", { exactMatch: false, revenue: { low: 9, high: 999 } }), w("notd.com")],
  });
  assert.equal(pickCompetitor(winners, td)?.winner.domain, "b.com");
  assert.equal(pickCompetitor(winners, new Map([["off.com", "t"]])), null);
  assert.equal(pickCompetitor(winners, new Map()), null);
});

test("a global (non-niche) winners list never yields a competitor", () => {
  assert.deepEqual(parseNicheWinners({ scope: "global", winners: [w("a.com")] }), []);
  assert.deepEqual(parseNicheWinners(null), []);
});

// ── observed_palette / flag-off schema (§3.3, §5) ───────────────────────

test("observed_palette is tolerant: garbage becomes undefined, never a validation failure", () => {
  assert.equal(ObservedPaletteSchema.parse("nope"), undefined);
  assert.equal(ObservedPaletteSchema.parse(["red", 5]), undefined);
  assert.deepEqual(ObservedPaletteSchema.parse(["#1A1A1A", "bad", "#c8a165", "#000000", "#111111", "#222222", "#333333", "#444444"]), [
    "#1a1a1a", "#c8a165", "#000000", "#111111", "#222222", "#333333",
  ]);
});

test("the default tool schema is untouched; the palette variant only ADDS observed_palette", () => {
  assert.equal("observed_palette" in ANALYSIS_TOOL_SCHEMA.properties, false);
  assert.equal((ANALYSIS_TOOL_SCHEMA.required as readonly string[]).includes("observed_palette"), false);
  assert.equal("observed_palette" in ANALYSIS_TOOL_SCHEMA_WITH_PALETTE.properties, true);
  assert.deepEqual(
    Object.keys(ANALYSIS_TOOL_SCHEMA_WITH_PALETTE.properties).filter((k) => !(k in ANALYSIS_TOOL_SCHEMA.properties)),
    ["observed_palette"],
  );
  // old audits (no palette) still validate
  const base = {
    category_scores: { color_integration: 1, layout_proportion: 1, image_quality: 1, technical_optimization: 1, niche_coherence: 1, cro_principles: 1 },
    buyer_persona_response: { headline: "abc", quotes: ["q"], would_buy: true, reasons: [] },
    annotations: [],
    summary: "A valid summary text.",
    top_fixes: [],
  };
  assert.equal(AnalysisResultSchema.safeParse(base).success, true);
  assert.equal(AnalysisResultSchema.safeParse({ ...base, observed_palette: "garbage" }).success, true);
});
