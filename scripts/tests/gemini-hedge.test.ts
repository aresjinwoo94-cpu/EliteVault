import { test } from "node:test";
import assert from "node:assert/strict";
import { firstFulfilled } from "../../ai/providers/gemini";

/**
 * The racing primitive behind the deferred hedge.
 *
 * `Promise.race` is the obvious-looking choice and it is WRONG here: it settles
 * on the first REJECTION too, so a fast 429 on one key would decide the run and
 * throw away the slower call that was about to succeed. That is precisely the
 * failure hedging exists to prevent, so this file pins the difference.
 */

const after = <T>(ms: number, value: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));
const failAfter = (ms: number, err: unknown): Promise<never> =>
  new Promise((_, r) => setTimeout(() => r(err), ms));

test("the faster success wins", async () => {
  assert.equal(await firstFulfilled(after(60, "slow"), after(5, "fast")), "fast");
  assert.equal(await firstFulfilled(after(5, "fast"), after(60, "slow")), "fast");
});

test("a fast rejection does NOT cancel the slower success", async () => {
  // The whole point. Promise.race would reject here.
  const winner = await firstFulfilled(
    failAfter(5, new Error("429 rate limited")),
    after(40, "the good answer"),
  );
  assert.equal(winner, "the good answer");
});

test("either side may be the one that fails", async () => {
  assert.equal(
    await firstFulfilled(after(40, "ok"), failAfter(5, new Error("503"))),
    "ok",
  );
});

test("if both reject, the FIRST error propagates", async () => {
  // The caller's retry ladder branches on the error shape (429 → rotate key,
  // 503 → back off, empty → retry). Surfacing the wrong one would route the
  // failure down the wrong recovery path.
  const first = new Error("429 RESOURCE_EXHAUSTED");
  const second = new Error("503 UNAVAILABLE");
  await assert.rejects(
    () => firstFulfilled(failAfter(5, first), failAfter(30, second)),
    /429 RESOURCE_EXHAUSTED/,
  );
  // …and "first" means first to reject in TIME, not argument order.
  await assert.rejects(
    () => firstFulfilled(failAfter(30, second), failAfter(5, first)),
    /429 RESOURCE_EXHAUSTED/,
  );
});

test("it does not reject early while one side is still running", async () => {
  // A rejection at 5ms must not settle anything until the other side is done.
  const started = Date.now();
  const winner = await firstFulfilled(
    failAfter(5, new Error("boom")),
    after(50, "late"),
  );
  assert.equal(winner, "late");
  assert.ok(Date.now() - started >= 45, "should have waited for the survivor");
});

test("an already-settled promise is handled", async () => {
  assert.equal(await firstFulfilled(Promise.resolve("done"), after(50, "late")), "done");
  assert.equal(
    await firstFulfilled(Promise.reject(new Error("x")), after(20, "survivor")),
    "survivor",
  );
});
