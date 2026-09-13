import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveHedgeAfterMs,
  resolveThinkingBudget,
  shouldHedge,
  thinkingConfigFor,
} from "../../ai/providers/gemini";

/**
 * WP-1 (docs/analyzer-mejora-definitiva.md §2) — the two latency defaults that
 * now live in code instead of in an invisible Vercel override:
 *   • the deferred hedge is ON at 12s,
 *   • thinking is bounded at 256 tokens.
 *
 * Both must stay reversible without a deploy, so the env parsing is pinned as
 * carefully as the defaults themselves: a rollback value that silently falls
 * back to "on" is worse than no knob.
 */

// ─── Hedge ──────────────────────────────────────────────────────────────────

test("hedge: ON at 12s when the env var is unset", () => {
  assert.equal(resolveHedgeAfterMs(undefined), 12_000);
});

test("hedge: a blank env var means unset, not 'off'", () => {
  // Number("") is 0, which used to read as an explicit opt-out. An empty value
  // in the Vercel dashboard must not silently change behaviour.
  assert.equal(resolveHedgeAfterMs(""), 12_000);
  assert.equal(resolveHedgeAfterMs("   "), 12_000);
});

test("hedge: GEMINI_HEDGE_AFTER_MS=0 is the rollback and turns it OFF", () => {
  assert.equal(resolveHedgeAfterMs("0"), 0);
});

test("hedge: values under the 2s floor turn it off rather than double every call", () => {
  for (const v of ["1", "500", "1999", "-1", "-12000"]) {
    assert.equal(resolveHedgeAfterMs(v), 0, `"${v}" should disable the hedge`);
  }
});

test("hedge: in-range overrides are honoured", () => {
  assert.equal(resolveHedgeAfterMs("2000"), 2_000);
  assert.equal(resolveHedgeAfterMs("18000"), 18_000);
  assert.equal(resolveHedgeAfterMs("12000.6"), 12_001);
});

test("hedge: garbage falls back to the default, like every other knob here", () => {
  for (const v of ["abc", "NaN", "Infinity"]) {
    assert.equal(resolveHedgeAfterMs(v), 12_000, `"${v}" should fall back`);
  }
});

test("hedge: never fires with a single key (local dev), whatever the delay", () => {
  // One key means the second call shares the same quota and the same queue —
  // it is not an independent draw, just double the spend.
  assert.equal(shouldHedge({ hedgeAfterMs: 12_000, keyCount: 1, budgetFits: true }), false);
  assert.equal(shouldHedge({ hedgeAfterMs: 12_000, keyCount: 0, budgetFits: true }), false);
});

test("hedge: needs the feature on, 2+ keys AND room left in the step", () => {
  assert.equal(shouldHedge({ hedgeAfterMs: 12_000, keyCount: 2, budgetFits: true }), true);
  assert.equal(shouldHedge({ hedgeAfterMs: 12_000, keyCount: 6, budgetFits: true }), true);
  assert.equal(shouldHedge({ hedgeAfterMs: 0, keyCount: 6, budgetFits: true }), false);
  assert.equal(shouldHedge({ hedgeAfterMs: 12_000, keyCount: 6, budgetFits: false }), false);
});

// ─── Thinking budget ────────────────────────────────────────────────────────

test("thinking: bounded at 256 when the env var is unset", () => {
  assert.equal(resolveThinkingBudget(undefined), 256);
});

test("thinking: a blank env var means unset, not 'thinking disabled'", () => {
  // Number("") is 0, and 0 means "no thinking at all" — a quality change nobody
  // asked for, triggered by an empty dashboard field.
  assert.equal(resolveThinkingBudget(""), 256);
  assert.equal(resolveThinkingBudget("  "), 256);
});

test("thinking: the documented overrides are honoured", () => {
  assert.equal(resolveThinkingBudget("512"), 512, "rollback value");
  assert.equal(resolveThinkingBudget("384"), 384);
  assert.equal(resolveThinkingBudget("128"), 128);
  assert.equal(resolveThinkingBudget("0"), 0, "0 = thinking off");
  assert.equal(resolveThinkingBudget("-1"), -1, "-1 = model default (unbounded)");
  assert.equal(resolveThinkingBudget("255.6"), 256);
});

test("thinking: garbage falls back to the default", () => {
  for (const v of ["abc", "NaN", "Infinity"]) {
    assert.equal(resolveThinkingBudget(v), 256, `"${v}" should fall back`);
  }
});

test("thinking: the budget is sent to the model as thinkingConfig", () => {
  assert.deepEqual(thinkingConfigFor(256, false), {
    thinkingConfig: { thinkingBudget: 256 },
  });
  assert.deepEqual(thinkingConfigFor(0, false), {
    thinkingConfig: { thinkingBudget: 0 },
  });
});

test("thinking: nothing is sent for 'model default' or once a model refused it", () => {
  assert.deepEqual(thinkingConfigFor(-1, false), {});
  assert.deepEqual(thinkingConfigFor(256, true), {});
});
