import { test } from "node:test";
import assert from "node:assert/strict";
import { isTruncated, extractFinishReason, is503 } from "../../ai/providers/gemini";

/**
 * Regression: a real Scale-plan audit failed with
 *
 *   "Gemini: response was not valid JSON — Expected ',' or '}' after property
 *    value in JSON at position 7550"
 *
 * The model had been cut off at the output-token ceiling, so the JSON was
 * half-written. Nothing checked `finishReason`, so the truncated text went
 * straight to JSON.parse and the audit was failed and refunded — for a report
 * that was merely a bit long.
 *
 * These lock the detection. The provider now widens the ceiling and retries
 * instead of parsing a broken object.
 */

test("a response cut off at the token ceiling is detected as truncated", () => {
  assert.equal(isTruncated({ candidates: [{ finishReason: "MAX_TOKENS" }] }), true);
  // Some SDK versions report the same condition as LENGTH.
  assert.equal(isTruncated({ candidates: [{ finishReason: "LENGTH" }] }), true);
});

test("a complete response is not treated as truncated", () => {
  assert.equal(isTruncated({ candidates: [{ finishReason: "STOP" }] }), false);
});

test("detection never throws on a shape we didn't expect", () => {
  // A malformed/absent candidates array must not take down the audit on its
  // way to a truncation check.
  for (const weird of [{}, { candidates: [] }, { candidates: [{}] }, null, undefined, "x", 42]) {
    assert.doesNotThrow(() => isTruncated(weird));
    assert.equal(isTruncated(weird), false, JSON.stringify(weird));
  }
});

test("is503 recognizes Google's overload response (so the model chain falls back)", () => {
  // The exact shape the owner saw surface to the UI.
  const raw = '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}';
  assert.equal(is503(raw), true);
  assert.equal(is503("UNAVAILABLE"), true);
  assert.equal(is503('{"code": 503}'), true);
  // Not a 503.
  assert.equal(is503('{"error":{"code":429}}'), false);
  assert.equal(is503("everything fine"), false);
});

test("extractFinishReason returns the reason, or null when absent", () => {
  assert.equal(
    extractFinishReason({ candidates: [{ finishReason: "SAFETY" }] }),
    "SAFETY",
  );
  assert.equal(extractFinishReason({ candidates: [{}] }), null);
  assert.equal(extractFinishReason({}), null);
  // A non-string finishReason is not a reason.
  assert.equal(extractFinishReason({ candidates: [{ finishReason: 7 }] }), null);
});
