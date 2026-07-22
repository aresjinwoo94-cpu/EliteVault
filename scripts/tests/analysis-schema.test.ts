import { test } from "node:test";
import assert from "node:assert/strict";
import { AnalysisResultSchema } from "../../ai/schemas";

/**
 * The audit's output contract. Two things must hold at once:
 *   1. Malformed model output is REJECTED (it's what triggers the repair pass
 *      in the analyzer agent, instead of rendering a broken report).
 *   2. Audits stored before the v3.4 fields existed still VALIDATE, so old
 *      reports keep opening.
 */

const legacy = {
  score: 72,
  scenarios: {
    organic: 0.03,
    meta_ads_bad: 0.006,
    meta_ads_regular: 0.014,
    meta_ads_good: 0.028,
  },
  category_scores: {
    color_integration: 70,
    layout_proportion: 65,
    image_quality: 80,
    technical_optimization: 60,
    niche_coherence: 75,
    cro_principles: 68,
  },
  buyer_persona_response: {
    headline: "I'd hesitate — I can't tell what this actually does.",
    quotes: ["What am I even buying here?"],
    would_buy: false,
    reasons: ["No price above the fold"],
  },
  annotations: [
    {
      type: "arrow",
      x: 0.4,
      y: 0.2,
      severity: "high",
      message: "The hero never says what you sell.",
      fix: "Put the product name and outcome in the H1.",
    },
  ],
  summary: "A clean store that hides its offer below the fold.",
  top_fixes: [{ title: "Move the price above the fold", impact: "high", effort: "S" }],
};

test("an audit stored before the new fields still validates", () => {
  const parsed = AnalysisResultSchema.safeParse(legacy);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.ad_readiness, undefined);
    assert.equal(parsed.data.top_fixes[0].why, undefined);
  }
});

test("a current audit carries the fix rationale and the ad-readiness verdict", () => {
  const parsed = AnalysisResultSchema.safeParse({
    ...legacy,
    top_fixes: [
      {
        title: "Move the price above the fold",
        impact: "high",
        effort: "S",
        why: "Cold Meta traffic won't scroll to find out what it costs — they bounce and you pay for the click anyway.",
      },
    ],
    ad_readiness: {
      verdict: "almost",
      score: 54,
      summary: "Fix the offer clarity before funding a campaign.",
      blockers: [
        { title: "No price above the fold", why: "Every cold visitor has to hunt for it." },
      ],
    },
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.ad_readiness?.verdict, "almost");
    assert.match(parsed.data.top_fixes[0].why ?? "", /bounce/);
  }
});

test("a 'ready' verdict with no blockers is valid", () => {
  const parsed = AnalysisResultSchema.safeParse({
    ...legacy,
    ad_readiness: {
      verdict: "ready",
      score: 88,
      summary: "This page can take cold traffic today.",
      blockers: [],
    },
  });
  assert.equal(parsed.success, true);
});

test("malformed model output is rejected so the repair pass can run", () => {
  // Missing required block.
  assert.equal(
    AnalysisResultSchema.safeParse({ ...legacy, category_scores: undefined })
      .success,
    false,
  );
  // Out-of-range score — a model that returns 0..1 instead of 0..100.
  assert.equal(
    AnalysisResultSchema.safeParse({ ...legacy, score: 720 }).success,
    false,
  );
  // Invented enum value.
  assert.equal(
    AnalysisResultSchema.safeParse({
      ...legacy,
      top_fixes: [{ title: "Do a thing", impact: "critical", effort: "S" }],
    }).success,
    false,
  );
  // Invalid ad-readiness verdict.
  assert.equal(
    AnalysisResultSchema.safeParse({
      ...legacy,
      ad_readiness: { verdict: "maybe", score: 50, summary: "Not sure at all." },
    }).success,
    false,
  );
});
