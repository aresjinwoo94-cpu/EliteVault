import { test } from "node:test";
import assert from "node:assert/strict";
import { gateResult, gateRowResult, toClientAnalysis } from "../../lib/analyzer/client-payload";
import { hasFullReport } from "../../lib/unlocks/report-unlock";

/** WP-1 (brief oct-2026 §3) — the paid cure never leaves the server for a viewer without the full report. */
const SECRET = "SECRET-HOW-TO-STEPS";
const RESULT = {
  score: 54,
  summary: "diagnosis stays",
  top_fixes: [
    { title: "Fix one", impact: "high", effort: "S", why: `${SECRET} one`, evidence: "ev1", theme_slug: "dawn" },
    { title: "Fix two", impact: "medium", effort: "M", why: `${SECRET} two`, evidence: "ev2", theme_slug: "x" },
    { title: "Fix three", impact: "low", effort: "L", why: `${SECRET} three` },
  ],
  buyer_persona_response: { headline: `${SECRET} headline`, quotes: [`${SECRET} q1`, "q2"], would_buy: false, reasons: [SECRET] },
};
const ROW = { id: "a1", status: "succeeded", result: RESULT, niche_winners: { w: 1 }, fix_tracks: { t: 1 }, meta_ads: null };

test("hasFullReport: paid plan or unlock; free/null/unknown is closed", () => {
  assert.equal(hasFullReport({ plan: "free" }), false);
  assert.equal(hasFullReport({ plan: null }), false);
  assert.equal(hasFullReport({ plan: undefined }), false);
  assert.equal(hasFullReport({ plan: "pro" }), true);
  assert.equal(hasFullReport({ plan: "scale" }), true);
  assert.equal(hasFullReport({ plan: "free", unlocked: true }), true);
});

test("without the full report: fix #1 whole, #2+ title/impact/effort only, persona null", () => {
  const out = gateResult(RESULT, false) as Record<string, any>;
  assert.deepEqual(out.top_fixes[0], RESULT.top_fixes[0]);
  assert.deepEqual(out.top_fixes[1], { title: "Fix two", impact: "medium", effort: "M", locked: true });
  assert.deepEqual(Object.keys(out.top_fixes[2]).sort(), ["effort", "impact", "locked", "title"]);
  assert.equal(out.buyer_persona_response, null);
  assert.equal(out.persona_locked, true);
  assert.equal(out.summary, "diagnosis stays");
  assert.equal(out.top_fixes.length, 3, "count is preserved for the 'N more fixes' counter");
});

test("the serialized client payload contains no locked text", () => {
  const json = JSON.stringify(toClientAnalysis(ROW, { canSeeOptimizer: false, hasFullReport: false }));
  assert.equal(json.includes("two"), json.includes("Fix two"), "titles may appear");
  assert.ok(!json.includes("SECRET-HOW-TO-STEPS two"));
  assert.ok(!json.includes("SECRET-HOW-TO-STEPS three"));
  assert.ok(!json.includes("headline"));
  assert.ok(!json.includes("ev2"));
  assert.ok(!json.includes("niche_winners") && !json.includes("fix_tracks"));
});

test("with the full report the result is untouched", () => {
  const out = toClientAnalysis(ROW, { canSeeOptimizer: false, hasFullReport: true }) as Record<string, any>;
  assert.deepEqual(out.result, RESULT);
});

test("fails closed on a non-true flag and tolerates rows without a result", () => {
  const out = gateResult(RESULT, undefined as unknown as boolean) as Record<string, any>;
  assert.equal(out.buyer_persona_response, null);
  assert.deepEqual(gateRowResult({ id: 1, result: null }, false), { id: 1, result: null });
  assert.equal(gateResult(null, false), null);
});
