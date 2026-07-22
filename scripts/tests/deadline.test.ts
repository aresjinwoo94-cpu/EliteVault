import { test } from "node:test";
import assert from "node:assert/strict";
import {
  startDeadline,
  deadlineAt,
  isDeadlineError,
  DeadlineExceededError,
} from "../../lib/deadline";

/**
 * The step-budget primitive that stops the analyzer from being cut off
 * mid-step with a 504. Every assertion here maps to a way the old code could
 * overrun its serverless ceiling.
 */

test("reports the time it has left", () => {
  const dl = startDeadline(1_000);
  assert.ok(dl.remaining() > 900 && dl.remaining() <= 1_000);
  assert.equal(dl.expired(), false);
  assert.equal(dl.has(500), true);
  assert.equal(dl.has(5_000), false);
});

test("an expired budget is expired, and assert() throws a typed error", () => {
  const dl = deadlineAt(Date.now() - 1);
  assert.equal(dl.expired(), true);
  assert.equal(dl.remaining(), 0);
  assert.throws(() => dl.assert("vision call"), DeadlineExceededError);
  try {
    dl.assert("vision call");
  } catch (err) {
    assert.ok(isDeadlineError(err));
    assert.match((err as Error).message, /vision call/);
  }
});

test("sleep() refuses a wait that doesn't fit instead of overrunning", async () => {
  // This is the actual 504: the Gemini provider would sleep 8s (503 back-off)
  // or up to 70s (key cooldown) with only seconds of step budget left.
  const dl = startDeadline(2_000);
  const before = Date.now();
  const slept = await dl.sleep(8_000);
  assert.equal(slept, false, "must not sleep past the budget");
  assert.ok(Date.now() - before < 200, "must return immediately");
});

test("sleep() performs a wait that does fit", async () => {
  const dl = startDeadline(5_000);
  const before = Date.now();
  const slept = await dl.sleep(150);
  assert.equal(slept, true);
  assert.ok(Date.now() - before >= 140);
});

test("signal() aborts when the budget runs out", async () => {
  const dl = startDeadline(120);
  const signal = dl.signal();
  assert.equal(signal.aborted, false);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(signal.aborted, true, "an overrunning call must be aborted");
});

test("an unbounded budget never aborts immediately", async () => {
  // Regression: an 'infinite' deadline exceeds the 32-bit timer range, where
  // setTimeout silently clamps to 1ms — which would have aborted EVERY call
  // from a caller that didn't pass a deadline.
  const dl = deadlineAt(Number.MAX_SAFE_INTEGER);
  const signal = dl.signal();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(signal.aborted, false);
});

test("signal() still honours the caller's own cancellation", () => {
  const outer = new AbortController();
  const dl = startDeadline(10_000);
  const signal = dl.signal({ parent: outer.signal });
  outer.abort();
  assert.equal(signal.aborted, true);
});

test("signal() can be capped below the remaining budget", async () => {
  const dl = startDeadline(10_000);
  const signal = dl.signal({ capMs: 100 });
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(signal.aborted, true);
});
