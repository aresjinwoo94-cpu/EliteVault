import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOTAL_BUDGET_MS,
  TotalBudgetExceededError,
  isTotalBudgetError,
  assertTotalBudget,
  DeadlineExceededError,
  isDeadlineError,
} from "../../lib/deadline";

/**
 * The hard total-elapsed ceiling on a whole analysis.
 *
 * STEP_BUDGET_MS bounds ONE attempt so Vercel never 504s; this bounds how many
 * full attempts are allowed to stack before we give up and refund. The two are
 * deliberately different signals, and the tests below pin that difference —
 * conflating them is how a "stop retrying" abort would get retried anyway.
 */

test("defaults to a ceiling just under the 60s platform limit", () => {
  // The default must leave room for onFailure's own writes. If someone raises
  // maxDuration later, this is an env override — not a code edit.
  assert.ok(
    TOTAL_BUDGET_MS > 0 && TOTAL_BUDGET_MS <= 60_000,
    `expected a positive ceiling at or under 60s, got ${TOTAL_BUDGET_MS}`,
  );
});

test("carries the numbers a human needs to see in the message", () => {
  const err = new TotalBudgetExceededError("run-analyzer-agent", 61_500, 58_000);
  assert.equal(err.name, "TotalBudgetExceededError");
  assert.equal(err.elapsedMs, 61_500);
  assert.equal(err.budgetMs, 58_000);
  assert.match(err.message, /run-analyzer-agent/);
  assert.match(err.message, /62s elapsed/); // rounded
  assert.match(err.message, /58s ceiling/);
});

test("is recognised by instance AND by message", () => {
  const err = new TotalBudgetExceededError("capture-screenshot", 60_000, 58_000);
  assert.equal(isTotalBudgetError(err), true);
  // Inngest serialises errors across the wire, so onFailure often sees a plain
  // Error carrying only the message. That path has to keep working.
  assert.equal(isTotalBudgetError(new Error(err.message)), true);
});

test("does not fire on unrelated errors", () => {
  assert.equal(isTotalBudgetError(new Error("Gemini 429 rate limited")), false);
  assert.equal(isTotalBudgetError(null), false);
  assert.equal(isTotalBudgetError(undefined), false);
  assert.equal(isTotalBudgetError("some string"), false);
});

test("total-budget and step-budget errors never classify as each other", () => {
  // This separation is load-bearing: a step-budget error is RETRYABLE (give the
  // step a fresh attempt), a total-budget error is NOT (stop and refund). If
  // either predicate matched the other's error the abort would be retried,
  // which is the exact behaviour this feature exists to remove.
  const total = new TotalBudgetExceededError("run-analyzer-agent", 60_000, 58_000);
  const step = new DeadlineExceededError("gemini-vision");

  assert.equal(isTotalBudgetError(total), true);
  assert.equal(isDeadlineError(total), false);

  assert.equal(isDeadlineError(step), true);
  assert.equal(isTotalBudgetError(step), false);
});

test("assertTotalBudget: passes below the ceiling, and exactly on it", () => {
  const queuedAt = 1_000_000;
  const budgetMs = 58_000;
  // Well inside.
  assert.doesNotThrow(() =>
    assertTotalBudget(queuedAt, "capture-screenshot", {
      now: queuedAt + 10_000,
      budgetMs,
    }),
  );
  // Exactly on the ceiling must NOT refund — an audit that finishes on the
  // boundary is a success, not a timeout.
  assert.doesNotThrow(() =>
    assertTotalBudget(queuedAt, "capture-screenshot", {
      now: queuedAt + budgetMs,
      budgetMs,
    }),
  );
});

test("assertTotalBudget: aborts one millisecond past the ceiling", () => {
  const queuedAt = 1_000_000;
  const budgetMs = 58_000;
  assert.throws(
    () =>
      assertTotalBudget(queuedAt, "run-analyzer-agent", {
        now: queuedAt + budgetMs + 1,
        budgetMs,
      }),
    (err: unknown) => {
      assert.ok(err instanceof TotalBudgetExceededError);
      assert.equal(isTotalBudgetError(err), true);
      assert.equal(err.budgetMs, budgetMs);
      assert.equal(err.elapsedMs, budgetMs + 1);
      return true;
    },
  );
});

test("assertTotalBudget measures from QUEUED, so retries do not reset it", () => {
  // The whole point: attempt 3 starting fresh still sees the original elapsed
  // time and gives up, instead of being handed another full budget.
  const queuedAt = 1_000_000;
  const budgetMs = 58_000;
  const thirdAttemptStartsAt = queuedAt + 120_000;
  assert.throws(
    () =>
      assertTotalBudget(queuedAt, "run-analyzer-agent", {
        now: thirdAttemptStartsAt,
        budgetMs,
      }),
    TotalBudgetExceededError,
  );
});

test("assertTotalBudget: a clock skew into the past never refunds a good audit", () => {
  // If created_at somehow reads later than now, elapsed goes negative. That
  // must be treated as "plenty of time", never as an overrun.
  const queuedAt = 1_000_000;
  assert.doesNotThrow(() =>
    assertTotalBudget(queuedAt, "capture-screenshot", {
      now: queuedAt - 5_000,
      budgetMs: 58_000,
    }),
  );
});
