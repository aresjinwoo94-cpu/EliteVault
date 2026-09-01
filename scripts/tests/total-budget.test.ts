import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("the ceiling is a usable positive integer, however it was configured", () => {
  // Deliberately NOT asserting 58_000: the value is an env override by design,
  // so pinning it would fail for anyone who tuned it. What must hold is that
  // junk never leaves the guard in a state where it silently does nothing —
  // NaN would make every comparison false and disable the ceiling entirely.
  assert.equal(Number.isFinite(TOTAL_BUDGET_MS), true);
  assert.equal(Number.isInteger(TOTAL_BUDGET_MS), true);
  assert.ok(TOTAL_BUDGET_MS > 0, `expected a positive ceiling, got ${TOTAL_BUDGET_MS}`);
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

/**
 * Structural guards on analyze-website.ts.
 *
 * The most important safety property of this feature cannot be reached from a
 * unit test — it is *where* the guard is called. An Inngest function body
 * re-executes at every step boundary, so a guard placed after `save-result`,
 * or in a step that runs after the audit is computed, would refund work the
 * user already has. These read the source and pin that placement, because an
 * accidental move is silent, costly, and exactly the P0 an earlier revision of
 * this branch shipped.
 */
const analyzerSource = readFileSync(
  new URL("../../inngest/functions/analyze-website.ts", import.meta.url),
  "utf8",
);

test("no total-budget guard runs after save-result", () => {
  const saveIdx = analyzerSource.indexOf('step.run("save-result"');
  assert.ok(saveIdx > 0, "save-result step not found — did the step get renamed?");
  const after = analyzerSource.slice(saveIdx);
  assert.equal(
    /assertTotalBudget\s*\(/.test(after),
    false,
    "a total-budget guard appears at or after save-result: it could flip an " +
      "already-succeeded audit into refunded",
  );
});

test("run-meta-ads-agent has no total-budget guard", () => {
  // It runs after the audit is computed but before save-result, so throwing
  // there discards a finished, paid-for audit AND breaks the documented
  // best-effort contract (a meta-ads failure must yield null, not kill the run).
  const start = analyzerSource.indexOf('step.run("run-meta-ads-agent"');
  assert.ok(start > 0, "run-meta-ads-agent step not found");
  const body = analyzerSource.slice(start, analyzerSource.indexOf('step.run("save-result"'));
  assert.equal(
    /assertTotalBudget\s*\(/.test(body),
    false,
    "run-meta-ads-agent must not abort the run on the total budget",
  );
});

test("the guard is measured from the run start, not from row creation", () => {
  // created_at includes time spent waiting behind the concurrency limits,
  // which is our scheduling, not the audit failing. Measuring from it refunds
  // audits that never executed any work.
  assert.equal(
    /assertWithinTotalBudget\(\s*runStartedAtMs/.test(analyzerSource),
    true,
    "expected the ceiling to be measured from runStartedAtMs",
  );
  assert.equal(
    /assertWithinTotalBudget\(\s*queuedAtMs/.test(analyzerSource),
    false,
    "the ceiling must not be measured from the queued instant",
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
