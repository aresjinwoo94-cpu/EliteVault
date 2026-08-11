import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnalysisResult } from "../../lib/supabase/types";
import {
  computePlacement,
  compositeOf,
  projectPlacement,
  progressToNextRank,
} from "../../lib/growth-map/placement";
import { scaffoldDiagnosis, scaffoldNodes } from "../../lib/growth-map/phrase-bank";
import { gateForViewer } from "../../lib/growth-map/gate";
import { GROWTH_MAP_VERSION, type GrowthMapData } from "../../lib/growth-map/types";

/**
 * Growth Map — deterministic guarantees the spec (§0/§10) requires WITHOUT the
 * paid AI call: different stores land on different ranks with different copy,
 * "TU TIENDA" is not pinned to The Wall, and Free is gated out of the escape
 * route. The store-specific AI layer is a best-effort enrichment on top of this
 * floor (and its input is per-store, so it can only add distinctness).
 */

function makeResult(over: {
  score: number;
  cro: number;
  offer: number;
  summary: string;
  topFix: string;
  layout?: number;
  image?: number;
  technical?: number;
  color?: number;
}): AnalysisResult {
  return {
    score: over.score,
    scenarios: {
      organic: 0.01,
      meta_ads_bad: 0.005,
      meta_ads_regular: 0.015,
      meta_ads_good: 0.03,
    },
    category_scores: {
      color_integration: over.color ?? 60,
      layout_proportion: over.layout ?? 60,
      image_quality: over.image ?? 60,
      technical_optimization: over.technical ?? 60,
      niche_coherence: over.offer,
      cro_principles: over.cro,
    },
    buyer_persona_response: {
      headline: "x",
      quotes: ["a"],
      would_buy: false,
      reasons: [],
    },
    annotations: [],
    summary: over.summary,
    top_fixes: [{ title: over.topFix, impact: "high", effort: "M" }],
  } as unknown as AnalysisResult;
}

// Three genuinely different stores (spec §10 uses 3 distinct URLs).
const storeA = makeResult({
  score: 22,
  cro: 20,
  offer: 24,
  summary: "A cluttered skincare serum store; the hero says three things at once.",
  topFix: "Rewrite the hero to name the offer in one line",
});
const storeB = makeResult({
  score: 60,
  cro: 58,
  offer: 55,
  summary: "A footwear brand with clean product pages but weak trust signals.",
  topFix: "Add reviews and returns policy above the fold",
});
const storeC = makeResult({
  score: 76,
  cro: 78,
  offer: 80,
  summary: "A polished coffee beverage brand with strong imagery and structure.",
  topFix: "Tighten the checkout upsell flow",
});

test("three different stores land on three different ranks", () => {
  const a = computePlacement(storeA);
  const b = computePlacement(storeB);
  const c = computePlacement(storeC);

  const ranks = new Set([a.rankKey, b.rankKey, c.rankKey]);
  assert.equal(ranks.size, 3, `expected 3 distinct ranks, got ${[...ranks]}`);

  // Spec §10 — the "TU TIENDA" marker must NOT always sit at The Wall (Steel).
  const atWall = [a, b, c].filter((p) => p.atWallEdge);
  assert.ok(atWall.length < 3, "not every store should be at The Wall");
});

test("calibration (§6): an average store with leaks lands at The Wall, not past it", () => {
  // The tech-fixes §6 example: 58/100, sterile imagery (45), thin offer (55).
  // Old bands dropped this into Silver/Optimization (past The Wall); the hook is
  // strongest AT the wall, so it must now land at Steel with atWallEdge set.
  const mediocre = makeResult({
    score: 58,
    cro: 60,
    offer: 55,
    image: 45,
    summary: "Sterile imagery, offer isn't legible in two seconds.",
    topFix: "Reshoot the hero and lead with the offer",
  });
  const p = computePlacement(mediocre);
  assert.equal(p.rankKey, "steel", `expected steel, got ${p.rankKey}`);
  assert.ok(p.atWallEdge, "a mediocre store with leaks must feel The Wall");

  // A genuinely strong store still escapes past The Wall — the gate isn't just
  // "everyone is stuck".
  const strong = computePlacement(storeC);
  assert.ok(!strong.atWallEdge, "a strong store escapes The Wall");
  assert.notEqual(strong.rankKey, "steel");
});

test("calibration: critical leaks hold a high-scoring store back to The Wall", () => {
  // High composite, but the shopper can't tell what it sells (offer 40). The
  // number alone would place it in Gold; findings must pull it to Steel.
  const flattered = makeResult({
    score: 88,
    cro: 85,
    offer: 40, // critical: offer not legible
    summary: "Beautiful, but you can't tell what they sell.",
    topFix: "Name the offer in the hero",
  });
  const p = computePlacement(flattered);
  assert.equal(p.rankKey, "steel", `expected steel, got ${p.rankKey}`);
  assert.ok(p.atWallEdge);
});

test("placement signals are non-empty and store-specific", () => {
  const a = computePlacement(storeA);
  const c = computePlacement(storeC);
  assert.ok(a.signals.length > 0, "weak store should surface signals");
  // The weak store names leaks; the strong store leads with strengths — so the
  // signal sets differ between stores.
  assert.notDeepEqual(a.signals, c.signals);
});

test("scaffold diagnosis differs per store (no identical copy)", () => {
  const da = scaffoldDiagnosis(computePlacement(storeA), "Skincare");
  const db = scaffoldDiagnosis(computePlacement(storeB), "Footwear");
  const dc = scaffoldDiagnosis(computePlacement(storeC), "Beverage");
  const all = new Set([da, db, dc]);
  assert.equal(all.size, 3, "each store must get distinct diagnosis copy");
  assert.match(da, /Skincare/); // niche flavor is woven in
});

test("Free gating locks every node ahead; Pro sees all unlocked", () => {
  const placement = computePlacement(storeB);
  const data: GrowthMapData = {
    version: GROWTH_MAP_VERSION,
    placement,
    nodes: scaffoldNodes(placement, "Footwear", { lockNext: false }),
    diagnosis: "d",
    source: "scaffold",
    nicheLabel: "Footwear",
    generatedAt: new Date().toISOString(),
  };

  const free = gateForViewer(data, false);
  const nextNodes = free.nodes.filter((n) => n.role === "next");
  assert.ok(nextNodes.length > 0, "there should be nodes ahead to lock");
  assert.ok(
    nextNodes.every((n) => n.locked),
    "Free must have every ahead-node locked (the escape route)",
  );
  // Current + past stay open for Free (diagnosis is free).
  assert.ok(free.nodes.some((n) => n.role === "current" && !n.locked));

  const pro = gateForViewer(data, true);
  assert.ok(
    pro.nodes.every((n) => !n.locked),
    "Pro sees the full escape route unlocked",
  );
});

// ── §1.1 — the projected "potential" node ──────────────────────────────────

test("projectPlacement advances at most one rank and never demotes", () => {
  for (const store of [storeA, storeB, storeC]) {
    const current = computePlacement(store);
    const proj = projectPlacement(store, current);
    assert.ok(
      proj.rankIndex >= current.rankIndex,
      "projection must never sit below the current rank",
    );
    assert.ok(
      proj.rankIndex <= current.rankIndex + 1,
      `projection may advance at most one rank (was +${proj.rankIndex - current.rankIndex})`,
    );
    assert.equal(
      proj.advances,
      proj.rankIndex > current.rankIndex,
      "advances flag must mirror the rank delta",
    );
  }
});

test("projectPlacement caps the projected composite at 100", () => {
  // A strong store (~76 composite) with a pile of high-impact fixes would blow
  // past 100 without the cap.
  const stacked = {
    ...storeC,
    top_fixes: [
      { title: "a", impact: "high", effort: "M" },
      { title: "b", impact: "high", effort: "M" },
      { title: "c", impact: "high", effort: "M" },
      { title: "d", impact: "high", effort: "M" },
      { title: "e", impact: "high", effort: "M" },
    ],
  } as unknown as AnalysisResult;
  const proj = projectPlacement(stacked, computePlacement(stacked));
  assert.ok(proj.composite <= 100, `composite must cap at 100, got ${proj.composite}`);
  assert.ok(proj.composite >= compositeOf(stacked));
});

test("projectPlacement is deterministic (same input → same output)", () => {
  const current = computePlacement(storeA);
  const a = projectPlacement(storeA, current);
  const b = projectPlacement(storeA, current);
  assert.deepEqual(a, b);
});

test("projectPlacement surfaces the lift fixes (≤3) that drive the advance", () => {
  const current = computePlacement(storeA);
  const proj = projectPlacement(storeA, current);
  assert.ok(proj.liftFixes.length <= 3);
  // storeA's single high-impact fix should be named.
  assert.ok(proj.liftFixes.includes(storeA.top_fixes[0].title));
});

// ── A3 — intra-stage progress toward the next rank ──────────────────────────

test("progressToNextRank: mid-band composite reports partial progress + edge distance", () => {
  // Steel band is [40,70); composite 55 sits halfway to the Silver edge (70).
  const p = progressToNextRank(55, 1);
  assert.ok(Math.abs(p.pct - 0.5) < 0.02, `expected ~0.5 pct, got ${p.pct}`);
  assert.equal(p.toNextEdge, 15, `expected 15 points to the edge, got ${p.toNextEdge}`);
  assert.equal(p.nextRankKey, "silver");
});

test("progressToNextRank: improvement within the SAME band is visible (A3 sensitivity)", () => {
  // The whole point: a store that improves but doesn't cross a rank still moves
  // the bar — indispensable while most stores live in the wide Steel band.
  const lo = progressToNextRank(45, 1);
  const hi = progressToNextRank(65, 1);
  assert.ok(hi.pct > lo.pct, "a higher composite in the same band must show more progress");
  assert.ok(hi.toNextEdge < lo.toNextEdge, "and fewer points to the next edge");
});

test("progressToNextRank: derives band edges from bandCompositeToIndex (no drift)", () => {
  // At the lower edge of a band, progress is ~0; just under the upper edge, ~full.
  const bottom = progressToNextRank(40, 1); // Steel lower edge
  const top = progressToNextRank(69, 1); // just below Silver edge (70)
  assert.ok(bottom.pct < 0.05, `bottom of band should read ~0, got ${bottom.pct}`);
  assert.ok(top.pct > 0.9, `top of band should read ~full, got ${top.pct}`);
  assert.equal(top.toNextEdge, 1);
});

test("progressToNextRank: top rank (Ruby) has no next edge", () => {
  const p = progressToNextRank(98, 5);
  assert.equal(p.nextRankKey, null);
  assert.equal(p.toNextEdge, 0);
  assert.equal(p.pct, 1);
});

test("progressToNextRank: clamps and stays deterministic", () => {
  assert.deepEqual(progressToNextRank(55, 1), progressToNextRank(55, 1));
  // Out-of-range composite is clamped, never NaN/negative.
  const over = progressToNextRank(200, 1);
  assert.ok(over.pct >= 0 && over.pct <= 1);
  assert.ok(over.toNextEdge >= 0);
});

test("§11 sensitivity: removing a cited leak lifts the deterministic read on re-run", () => {
  // The same store, twice: once with a CRO leak, once with it fixed. The
  // deterministic layer (composite → band → intra-stage progress) MUST recognize
  // the improvement so a re-audit doesn't feel like the tool ignored the work.
  const withLeak = makeResult({
    score: 52,
    cro: 44, // the leak the owner is told to fix
    offer: 58,
    summary: "Passive CTA below the fold; funnel leaks.",
    topFix: "Move the CTA above the fold and make it outcome-first",
  });
  const fixed = makeResult({
    score: 60, // fixing the funnel lifts the headline too
    cro: 68, // the cited leak is gone
    offer: 58,
    summary: "CTA above the fold; funnel tightened.",
    topFix: "Add reviews near the buy button",
  });

  assert.ok(
    compositeOf(fixed) > compositeOf(withLeak),
    "clearing the leak must raise the composite",
  );

  const before = computePlacement(withLeak);
  const after = computePlacement(fixed);
  const pBefore = progressToNextRank(compositeOf(withLeak), before.rankIndex);
  const pAfter = progressToNextRank(compositeOf(fixed), after.rankIndex);
  // Either the rank advances OR the intra-stage bar moves forward — either way,
  // the owner sees recognition (never a flat/negative read for a real fix).
  const moved =
    after.rankIndex > before.rankIndex || pAfter.pct > pBefore.pct;
  assert.ok(moved, "a real fix must move the rank or the intra-stage progress bar");
});

test("scaffoldNodes lockNext toggles the immediate next node", () => {
  const placement = computePlacement(storeA); // Copper → next is Steel
  const locked = scaffoldNodes(placement, "Skincare", { lockNext: true });
  const open = scaffoldNodes(placement, "Skincare", { lockNext: false });
  const nextIdx = placement.rankIndex + 1;
  assert.equal(locked[nextIdx].locked, true);
  assert.equal(open[nextIdx].locked, false);
});
