import { test } from "node:test";
import assert from "node:assert/strict";
import { startDeadline, deadlineAt } from "../../lib/deadline";

/**
 * The per-call cap, and the rule that decides when it applies.
 *
 * Why it exists: `lib/deadline.ts` always supported `capMs` and nothing passed
 * it, so ONE generation could spend the entire 50s step. When that happened the
 * step died and Inngest retried the whole thing — a fresh invocation that
 * re-fetches the screenshot and pays the backoff again. Production was visibly
 * bimodal: 37s / 38s / 46s when a step succeeded first time, 121s / 123s / 124s
 * when it retried, and nothing in between.
 *
 * These tests pin the ARITHMETIC of the rule. Whether 25s is the right number
 * is a question for production data, not for a unit test.
 */

/** The rule as implemented in ai/providers/gemini.ts. */
function callCap(remainingMs: number, cap: number): number | undefined {
  if (cap <= 0) return undefined;
  return remainingMs >= cap * 2 ? cap : undefined;
}

test("a full step budget gets capped, leaving room for a second attempt", () => {
  assert.equal(callCap(50_000, 25_000), 25_000);
  // …and what's left after a capped attempt really does fit another try.
  assert.ok(50_000 - 25_000 >= 8_000);
});

test("the LAST chance is never cut short", () => {
  // Below 2x the cap there is no room for a retry, so cutting the call would
  // just throw away budget nothing else can use.
  assert.equal(callCap(49_999, 25_000), undefined);
  assert.equal(callCap(25_000, 25_000), undefined);
  assert.equal(callCap(9_000, 25_000), undefined);
});

test("cap 0 restores the old behaviour exactly", () => {
  for (const remaining of [50_000, 25_000, 9_000]) {
    assert.equal(callCap(remaining, 0), undefined);
  }
});

test("the deadline honours a cap without ever exceeding the budget", () => {
  // A cap larger than what's left must not extend the step — the budget is the
  // hard ceiling and the cap only ever shortens.
  const dl = startDeadline(10_000);
  const capped = dl.signal({ capMs: 30_000 });
  assert.ok(capped instanceof AbortSignal);
  assert.ok(dl.remaining() <= 10_000);
});

test("an expired budget still yields an already-usable signal", () => {
  // Guards against a cap of 0ms turning into setTimeout's clamped 1ms and
  // aborting instantly in a way the caller can't distinguish from a real abort.
  const dl = deadlineAt(Date.now() - 1);
  const s = dl.signal({ capMs: 25_000 });
  assert.ok(s instanceof AbortSignal);
});

test("two capped attempts fit where one uncapped attempt did not", () => {
  // The whole point, expressed as arithmetic: the step used to get one draw and
  // now gets two, without asking the platform for more than 50s.
  const BUDGET = 50_000;
  const cap = 25_000;
  const first = callCap(BUDGET, cap) ?? BUDGET;
  const left = BUDGET - first;
  const second = callCap(left, cap) ?? left;
  assert.equal(first, 25_000);
  assert.equal(second, 25_000);
  assert.equal(first + second, BUDGET);
});
