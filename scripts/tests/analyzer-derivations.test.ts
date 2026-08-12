import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnalysisResult } from "../../lib/supabase/types";
import {
  deriveOverallScore,
  withDerivedScore,
  SCORE_WEIGHTS,
} from "../../lib/analyzer/derive-score";
import {
  conversionScenarioBands,
  scenarioMidpoints,
} from "../../lib/analyzer/conversion-scenarios";
import {
  linkIssues,
  paidTrafficBlockers,
  issueFingerprint,
  diffIssues,
  snapshotIssues,
} from "../../lib/analyzer/link-issues";

/**
 * The three deterministic derivations the refactor moved OUT of the model
 * (brief §1/§2/§3). All pure: same input → same output, no I/O, no AI.
 */

const CATS = {
  color_integration: 50,
  layout_proportion: 60,
  image_quality: 70,
  technical_optimization: 40,
  niche_coherence: 80,
  cro_principles: 90,
};

function makeResult(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    score: 62,
    category_scores: { ...CATS },
    buyer_persona_response: {
      headline: "x",
      quotes: ["a"],
      would_buy: false,
      reasons: [],
    },
    annotations: [],
    summary: "A store that hides its offer.",
    top_fixes: [],
    ...over,
  } as AnalysisResult;
}

// ── §1 derive score ────────────────────────────────────────────────────────

test("§1 the weights sum to exactly 1.0 (a true weighted average)", () => {
  const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
});

test("§1 derived score is the documented weighted mean of the categories", () => {
  const expected = Math.round(
    50 * 0.1 + 60 * 0.2 + 70 * 0.16 + 40 * 0.14 + 80 * 0.12 + 90 * 0.28,
  );
  assert.equal(deriveOverallScore(CATS), expected);
});

test("§1 all-equal categories derive to that same number (hero == breakdown)", () => {
  const flat = {
    color_integration: 67,
    layout_proportion: 67,
    image_quality: 67,
    technical_optimization: 67,
    niche_coherence: 67,
    cro_principles: 67,
  };
  assert.equal(deriveOverallScore(flat), 67);
});

test("§1 0..1-scale categories are normalized to 0..100 first", () => {
  const frac = {
    color_integration: 0.5,
    layout_proportion: 0.6,
    image_quality: 0.7,
    technical_optimization: 0.4,
    niche_coherence: 0.8,
    cro_principles: 0.9,
  };
  assert.equal(deriveOverallScore(frac), deriveOverallScore(CATS));
});

test("§1 missing / all-zero categories return null so the caller can fall back", () => {
  assert.equal(deriveOverallScore(null), null);
  assert.equal(
    deriveOverallScore({
      color_integration: 0,
      layout_proportion: 0,
      image_quality: 0,
      technical_optimization: 0,
      niche_coherence: 0,
      cro_principles: 0,
    }),
    null,
  );
});

test("§1 withDerivedScore reconciles score and stamps schema_version 2", () => {
  const out = withDerivedScore(makeResult({ score: 1 }));
  assert.equal(out.score, deriveOverallScore(CATS));
  assert.equal(out.schema_version, 2);
});

// ── §2 conversion scenarios ────────────────────────────────────────────────

test("§2 scenarios are ordered bands: organic > good > regular > bad", () => {
  const bands = conversionScenarioBands(62, "skincare");
  const by = Object.fromEntries(bands.map((b) => [b.key, b]));
  assert.ok(by.organic.high > by.meta_ads_good.high);
  assert.ok(by.meta_ads_good.high > by.meta_ads_regular.high);
  assert.ok(by.meta_ads_regular.high > by.meta_ads_bad.high);
});

test("§2 every band has low < high (a real range, never a single point)", () => {
  for (const b of conversionScenarioBands(55, "pet")) {
    assert.ok(b.low < b.high, `${b.key} ${b.low}..${b.high}`);
    assert.ok(b.low > 0);
  }
});

test("§2 deterministic: same (score, niche) → identical bands", () => {
  assert.deepEqual(
    conversionScenarioBands(48, "apparel"),
    conversionScenarioBands(48, "apparel"),
  );
});

test("§2 a higher score lifts the realistic (regular) band", () => {
  const low = conversionScenarioBands(30, "supplements").find(
    (b) => b.key === "meta_ads_regular",
  )!;
  const high = conversionScenarioBands(85, "supplements").find(
    (b) => b.key === "meta_ads_regular",
  )!;
  assert.ok(high.high > low.high);
});

test("§2 midpoints fall inside their bands", () => {
  const bands = conversionScenarioBands(62, "jewelry");
  const mids = scenarioMidpoints(62, "jewelry");
  for (const b of bands) {
    const m = mids[b.key];
    assert.ok(m >= b.low && m <= b.high, `${b.key} mid ${m} not in ${b.low}..${b.high}`);
  }
});

// ── §3 link issues ─────────────────────────────────────────────────────────

test("§3 a blocker restating a top_fix collapses into one canonical issue", () => {
  const result = makeResult({
    top_fixes: [
      {
        title: "Add customer review count near the buy button",
        impact: "high",
        effort: "S",
        why: "Cold visitors trust numbers.",
      },
    ],
    ad_readiness: {
      verdict: "almost",
      score: 54,
      summary: "Fix proof before spending.",
      blockers: [{ title: "No visible review count", why: "Nothing builds trust." }],
    },
  });
  const linked = linkIssues(result);
  // The fix and the blocker are the same problem → one issue with two refs.
  const issue = linked.issues.find((i) => i.refs.length >= 2);
  assert.ok(issue, "fix and blocker should merge into one canonical issue");
  assert.ok(issue!.blocksPaidTraffic);
  // The canonical title prefers the roadmap fix's wording.
  assert.match(issue!.title, /review count/i);
});

test("§3 unrelated items stay separate issues", () => {
  const result = makeResult({
    top_fixes: [
      { title: "Compress the hero image", impact: "medium", effort: "S" },
    ],
    ad_readiness: {
      verdict: "almost",
      score: 50,
      summary: "…",
      blockers: [{ title: "Price is hidden below the fold", why: "…" }],
    },
  });
  const linked = linkIssues(result);
  assert.equal(linked.issues.length, 2);
});

test("§3 paidTrafficBlockers is a filtered view, not a regenerated list", () => {
  const result = makeResult({
    top_fixes: [
      { title: "State the offer in the H1", impact: "high", effort: "S" },
      { title: "Add a returns policy", impact: "low", effort: "M" },
    ],
    ad_readiness: {
      verdict: "not_ready",
      score: 30,
      summary: "…",
      blockers: [{ title: "Offer not stated in the H1", why: "…" }],
    },
  });
  const filtered = paidTrafficBlockers(linkIssues(result));
  // Only the H1 issue blocks paid traffic; the returns fix does not.
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].title, /H1|offer/i);
  // It carries the roadmap fix ref, so the UI can point at "fix #1".
  assert.ok(filtered[0].refs.some((r) => r.source === "fix"));
});

// ── D1 issueFingerprint ─────────────────────────────────────────────────────

test("D1 fingerprint is stable regardless of word order (same stems → same hash)", () => {
  const a = issueFingerprint(new Set(["review", "count", "button"]));
  const b = issueFingerprint(new Set(["button", "review", "count"]));
  assert.equal(a, b, "reordering the stem set must not change the fingerprint");
});

test("D1 fingerprint distinguishes genuinely different issue stems", () => {
  const reviews = issueFingerprint(new Set(["review", "count"]));
  const price = issueFingerprint(new Set(["price", "hidden"]));
  assert.notEqual(reviews, price);
});

test("D1 linkIssues assigns a non-empty fingerprint AND keeps the positional id", () => {
  const result = makeResult({
    top_fixes: [{ title: "Add customer review count", impact: "high", effort: "S" }],
  });
  const linked = linkIssues(result);
  assert.equal(linked.issues[0].issueId, "issue-1", "positional id is untouched");
  assert.match(linked.issues[0].fingerprint, /^f[0-9a-f]{8}$/);
});

// ── D2 diffIssues ───────────────────────────────────────────────────────────

test("D2 diff classifies resolved / stillOpen / introduced", () => {
  const prev = snapshotIssues(
    linkIssues(
      makeResult({
        top_fixes: [
          { title: "Add customer review count near the buy button", impact: "high", effort: "S" },
          { title: "Move the price above the fold", impact: "high", effort: "S" },
        ],
      }),
    ),
  );
  const curr = snapshotIssues(
    linkIssues(
      makeResult({
        top_fixes: [
          // price issue persists…
          { title: "Move the price above the fold", impact: "high", effort: "S" },
          // …a brand-new one appears; the review issue is gone (fixed).
          { title: "Compress the oversized hero image", impact: "medium", effort: "S" },
        ],
      }),
    ),
  );

  const diff = diffIssues(prev, curr);
  assert.equal(diff.resolved.length, 1);
  assert.match(diff.resolved[0].title, /review count/i);
  assert.equal(diff.stillOpen.length, 1);
  assert.match(diff.stillOpen[0].title, /price/i);
  assert.equal(diff.introduced.length, 1);
  assert.match(diff.introduced[0].title, /hero image/i);
});

test("D2 a reworded SAME issue is stillOpen — never 'resolved + new'", () => {
  const prev = snapshotIssues(
    linkIssues(
      makeResult({
        top_fixes: [{ title: "Add a visible customer review count", impact: "high", effort: "S" }],
      }),
    ),
  );
  const curr = snapshotIssues(
    linkIssues(
      makeResult({
        top_fixes: [
          { title: "Show the review count near the buy button", impact: "high", effort: "S" },
        ],
      }),
    ),
  );
  const diff = diffIssues(prev, curr);
  assert.equal(diff.resolved.length, 0, "a rewording must not read as resolved");
  assert.equal(diff.introduced.length, 0, "…nor as newly introduced");
  assert.equal(diff.stillOpen.length, 1, "it's the same issue, still open");
});

test("D2 diff is deterministic and empty-safe", () => {
  assert.deepEqual(diffIssues([], []), { resolved: [], stillOpen: [], introduced: [] });
  const snap = snapshotIssues(
    linkIssues(makeResult({ top_fixes: [{ title: "Fix the H1 offer", impact: "high", effort: "S" }] })),
  );
  // Empty prev → by the D2 contract every current issue is "only in curr" =
  // introduced. (In practice readGrowthMovement returns null when there's no
  // prior row, so the diff isn't even shown on a first run.)
  const diff = diffIssues([], snap);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.stillOpen.length, 0);
  assert.equal(diff.introduced.length, snap.length);
});
