import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnalysisResult } from "../../lib/supabase/types";
import { computePlacement, RANKS } from "../../lib/growth-map/placement";
import {
  potentialBandForResult,
  adReadinessWords,
  potentialWhy,
} from "../../lib/analyzer/report-v2";

/**
 * analyzer-report-redesign brief §1 — the v2 report's pure derivations.
 *
 * The load-bearing guarantee is brief §A.3: turning ANALYZER_REPORT_V2 on must
 * NOT change any number the pipeline computes — it only changes what we show.
 * So these lock: (1) the $ potential band is exactly the placement's own band
 * (no invented dollars), and (2) the ad-readiness verdict maps to words + a
 * count without ever surfacing the 0–100.
 */

function makeResult(over: {
  score: number;
  cro?: number;
  offer?: number;
  verdict?: "ready" | "almost" | "not_ready";
  blockers?: number;
  fixes?: number;
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
      color_integration: 70,
      layout_proportion: 70,
      image_quality: 70,
      technical_optimization: 70,
      niche_coherence: over.offer ?? 70,
      cro_principles: over.cro ?? 70,
    },
    buyer_persona_response: {
      headline: "x",
      quotes: ["a"],
      would_buy: false,
      reasons: [],
    },
    annotations: [],
    summary: "s",
    top_fixes: Array.from({ length: over.fixes ?? 3 }, (_, i) => ({
      title: `fix ${i + 1}`,
      impact: "high",
      effort: "M",
    })),
    ad_readiness: over.verdict
      ? {
          verdict: over.verdict,
          summary: "verdict summary",
          blockers: Array.from({ length: over.blockers ?? 0 }, (_, i) => ({
            title: `blocker ${i + 1}`,
            why: "because",
          })),
        }
      : undefined,
  } as unknown as AnalysisResult;
}

test("potentialWhy: the weakest rubric dimension is the lowest category", () => {
  // Hero refinement — the "Why this potential" bullets derive the weakest area
  // and the leak count IN CODE from the audit's own data (no new AI call).
  const why = potentialWhy(makeResult({ score: 55, cro: 30, offer: 70 }));
  assert.equal(why.weakestCategoryKey, "cro_principles");
  assert.equal(why.leakCount, 3);

  const why2 = potentialWhy(
    makeResult({ score: 55, cro: 70, offer: 25, fixes: 5 }),
  );
  assert.equal(why2.weakestCategoryKey, "niche_coherence");
  assert.equal(why2.leakCount, 5);
});

test("potentialWhy: normalizes 0..1 scores and is safe on a missing result", () => {
  const frac = {
    category_scores: {
      color_integration: 0.7,
      layout_proportion: 0.7,
      image_quality: 0.2, // lowest
      technical_optimization: 0.7,
      niche_coherence: 0.7,
      cro_principles: 0.7,
    },
    top_fixes: [{ title: "a", impact: "high", effort: "M" }],
  } as unknown as AnalysisResult;
  assert.equal(potentialWhy(frac).weakestCategoryKey, "image_quality");
  assert.equal(potentialWhy(frac).leakCount, 1);

  assert.equal(potentialWhy(null).weakestCategoryKey, null);
  assert.equal(potentialWhy(null).leakCount, 0);
  assert.equal(potentialWhy(undefined).leakCount, 0);

  // A present-but-empty category_scores must NOT report a false weakest at 0.
  const empty = {
    category_scores: {},
    top_fixes: [],
  } as unknown as AnalysisResult;
  assert.equal(potentialWhy(empty).weakestCategoryKey, null);
  assert.equal(potentialWhy(empty).leakCount, 0);
});

test("$ potential band is exactly the placement's own band (no invented number)", () => {
  for (const score of [15, 45, 62, 78, 88, 97]) {
    const result = makeResult({ score });
    const { rankIndex } = computePlacement(result);
    assert.equal(potentialBandForResult(result), RANKS[rankIndex].band);
  }
});

test("$ potential band never contains a 0–100 score or a rank name", () => {
  // The band is a $/mo overlay only; it must not leak the numbers/rank the flag
  // is meant to hide.
  const band = potentialBandForResult(makeResult({ score: 62 })) ?? "";
  assert.ok(band.length > 0);
  assert.doesNotMatch(band, /\/100/);
  for (const r of RANKS) {
    assert.doesNotMatch(band, new RegExp(`\\b${r.material}\\b`));
  }
});

test("potentialBandForResult returns null with no result", () => {
  assert.equal(potentialBandForResult(null), null);
  assert.equal(potentialBandForResult(undefined), null);
});

test("ad-readiness verdict resolves to words + a blocker count, never a score", () => {
  const notReady = adReadinessWords(
    makeResult({ score: 40, verdict: "not_ready", blockers: 3, fixes: 5 }),
  );
  assert.equal(notReady?.verdict, "not_ready");
  // Prefers the 3 media-buyer blockers when present.
  assert.equal(notReady?.blockerCount, 3);

  // "not ready" with no explicit blockers falls back to the fix count so the
  // hero always has a number to name.
  const noBlockers = adReadinessWords(
    makeResult({ score: 40, verdict: "not_ready", blockers: 0, fixes: 4 }),
  );
  assert.equal(noBlockers?.blockerCount, 4);

  // A "ready" store honestly reports whatever blockers remain (usually 0),
  // not the fix count.
  const ready = adReadinessWords(
    makeResult({ score: 85, verdict: "ready", blockers: 0, fixes: 3 }),
  );
  assert.equal(ready?.verdict, "ready");
  assert.equal(ready?.blockerCount, 0);
});

test("adReadinessWords returns null when the audit predates the field", () => {
  assert.equal(adReadinessWords(makeResult({ score: 60 })), null);
  assert.equal(adReadinessWords(null), null);
});
