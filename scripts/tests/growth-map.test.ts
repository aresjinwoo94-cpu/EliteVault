import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnalysisResult } from "../../lib/supabase/types";
import { computePlacement } from "../../lib/growth-map/placement";
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

test("scaffoldNodes lockNext toggles the immediate next node", () => {
  const placement = computePlacement(storeA); // Copper → next is Steel
  const locked = scaffoldNodes(placement, "Skincare", { lockNext: true });
  const open = scaffoldNodes(placement, "Skincare", { lockNext: false });
  const nextIdx = placement.rankIndex + 1;
  assert.equal(locked[nextIdx].locked, true);
  assert.equal(open[nextIdx].locked, false);
});
