import { test } from "node:test";
import assert from "node:assert/strict";
import { hedgedCall } from "../../ai/providers/gemini";

/**
 * The deferred hedge's orchestration, with fake calls in place of Gemini.
 *
 * WP-1 turns the hedge ON by default, so every path through it is now a
 * production path. Two of them were broken while it was opt-in:
 *
 *   1. HANG — when the hedge timer fired but no OTHER key was available, the
 *      hedge promise never settled. If the primary then failed (a 503, or the
 *      25s per-call cap aborting it), `firstFulfilled` waited forever for a
 *      second answer that was never coming, and the step ran into the platform
 *      timeout instead of failing cleanly into the retry ladder.
 *   2. SLOWER THAN NO HEDGE — a primary failing fast (a 429 at 1s) was held
 *      until the hedge fired, delaying key rotation by up to HEDGE_AFTER_MS.
 *
 * Invariant pinned here: with the hedge on, a call is never slower and never
 * less recoverable than the same call without it.
 */

const HEDGE_MS = 40;

/** Resolve after `ms`, or reject with AbortError when the signal fires. */
function fakeCall<T>(ms: number, value: T, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(value), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

function fakeFailure(ms: number, err: Error, signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => reject(err), ms);
    signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  });
}

/** Fail the test instead of hanging the runner if a promise never settles. */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`HUNG: ${what} did not settle within ${ms}ms`)), ms);
  });
  return Promise.race([p, guard]).finally(() => clearTimeout(t));
}

test("a fast primary wins and the hedge is never started", async () => {
  let hedgeStarts = 0;
  const result = await hedgedCall({
    hedgeAfterMs: HEDGE_MS,
    primary: (s) => fakeCall(5, "primary", s),
    hedge: (s) => {
      hedgeStarts++;
      return fakeCall(5, "hedge", s);
    },
  });
  assert.equal(result, "primary");
  // Give a leaked timer the chance to fire before asserting it didn't.
  await new Promise((r) => setTimeout(r, HEDGE_MS * 2));
  assert.equal(hedgeStarts, 0, "no second call may go out after the primary answered");
});

test("a slow primary is hedged, the faster hedge wins, and the primary is aborted", async () => {
  let primarySignal: AbortSignal | undefined;
  const started = Date.now();
  const result = await hedgedCall({
    hedgeAfterMs: HEDGE_MS,
    primary: (s) => {
      primarySignal = s;
      return fakeCall(1_000, "primary", s);
    },
    hedge: (s) => fakeCall(5, "hedge", s),
  });
  assert.equal(result, "hedge");
  assert.ok(Date.now() - started < 500, "should not have waited for the slow primary");
  assert.equal(primarySignal?.aborted, true, "the losing call must be aborted");
});

test("the slow primary still wins if it answers before the hedge does", async () => {
  let hedgeSignal: AbortSignal | undefined;
  const result = await hedgedCall({
    hedgeAfterMs: HEDGE_MS,
    primary: (s) => fakeCall(HEDGE_MS + 20, "primary", s),
    hedge: (s) => {
      hedgeSignal = s;
      return fakeCall(1_000, "hedge", s);
    },
  });
  assert.equal(result, "primary");
  assert.equal(hedgeSignal?.aborted, true, "the losing hedge must be aborted");
});

test("REGRESSION: no other key to hedge onto + primary fails → rejects, does not hang", async () => {
  const err503 = new Error('{"code": 503, "status": "UNAVAILABLE"}');
  await assert.rejects(
    within(
      hedgedCall({
        hedgeAfterMs: HEDGE_MS,
        primary: (s) => fakeFailure(HEDGE_MS + 30, err503, s),
        hedge: () => null, // every other key is on cooldown
      }),
      2_000,
      "hedgedCall",
    ),
    (e) => e === err503,
    "must surface the primary's own error so the retry ladder can act on it",
  );
});

test("no other key to hedge onto + primary succeeds late → returns the primary", async () => {
  const result = await within(
    hedgedCall({
      hedgeAfterMs: HEDGE_MS,
      primary: (s) => fakeCall(HEDGE_MS + 30, "primary", s),
      hedge: () => null,
    }),
    2_000,
    "hedgedCall",
  );
  assert.equal(result, "primary");
});

test("REGRESSION: a primary failing BEFORE the hedge fires fails now, not after the hedge delay", async () => {
  const err429 = new Error("429 RESOURCE_EXHAUSTED");
  let hedgeStarts = 0;
  const started = Date.now();
  await assert.rejects(
    hedgedCall({
      hedgeAfterMs: 1_000,
      primary: (s) => fakeFailure(5, err429, s),
      hedge: (s) => {
        hedgeStarts++;
        return fakeCall(5, "hedge", s);
      },
    }),
    (e) => e === err429,
  );
  assert.ok(
    Date.now() - started < 500,
    `a fast 429 must reach key rotation immediately (took ${Date.now() - started}ms)`,
  );
  await new Promise((r) => setTimeout(r, 1_100));
  assert.equal(hedgeStarts, 0, "the ladder rotates keys itself; no stray hedge afterwards");
});

test("a primary failing AFTER the hedge started does not cancel the hedge", async () => {
  const result = await hedgedCall({
    hedgeAfterMs: HEDGE_MS,
    primary: (s) => fakeFailure(HEDGE_MS + 10, new Error("503 UNAVAILABLE"), s),
    hedge: (s) => fakeCall(60, "hedge", s),
  });
  assert.equal(result, "hedge");
});

test("if both calls fail, the first error in time propagates", async () => {
  const first = new Error("503 UNAVAILABLE");
  const second = new Error("429 RESOURCE_EXHAUSTED");
  await assert.rejects(
    hedgedCall({
      hedgeAfterMs: HEDGE_MS,
      primary: (s) => fakeFailure(HEDGE_MS + 10, first, s),
      hedge: (s) => fakeFailure(60, second, s),
    }),
    (e) => e === first,
  );
});

test("a caller cancel aborts both calls", async () => {
  const parent = new AbortController();
  const signals: AbortSignal[] = [];
  const run = hedgedCall({
    hedgeAfterMs: HEDGE_MS,
    parent: parent.signal,
    primary: (s) => {
      signals.push(s);
      return fakeCall(1_000, "primary", s);
    },
    hedge: (s) => {
      signals.push(s);
      return fakeCall(1_000, "hedge", s);
    },
  });
  setTimeout(() => parent.abort(), HEDGE_MS + 20);
  await assert.rejects(within(run, 2_000, "cancelled hedgedCall"), /aborted/);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((s) => s.aborted), "both calls must see the cancel");
});

test("an already-cancelled caller never starts a call", async () => {
  const parent = new AbortController();
  parent.abort();
  let starts = 0;
  await assert.rejects(
    within(
      hedgedCall({
        hedgeAfterMs: HEDGE_MS,
        parent: parent.signal,
        primary: (s) => {
          starts++;
          return fakeCall(1_000, "primary", s);
        },
        hedge: (s) => {
          starts++;
          return fakeCall(1_000, "hedge", s);
        },
      }),
      2_000,
      "pre-cancelled hedgedCall",
    ),
    /aborted/,
  );
  await new Promise((r) => setTimeout(r, HEDGE_MS * 2));
  assert.equal(starts, 0, "a request nobody will read is pure quota");
});
