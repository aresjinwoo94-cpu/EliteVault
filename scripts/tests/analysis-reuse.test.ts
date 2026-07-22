import { test } from "node:test";
import assert from "node:assert/strict";
import { findReusableAnalysis } from "../../lib/analysis/reuse";

/**
 * Idempotency for audit requests: the same user asking for the same store
 * twice must not pay twice, and must not queue a duplicate job behind the
 * first — but "Try again" after a failure must always mean try again.
 */

const MINUTE = 60_000;

/** Minimal stand-in for the Supabase query builder chain used by the module. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeClient(result: { data?: unknown; error?: unknown }): any {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "order"]) {
    chain[m] = () => chain;
  }
  chain.limit = async () => result;
  return { from: () => chain };
}

function row(status: string, ageMs: number) {
  const at = new Date(Date.now() - ageMs).toISOString();
  return { id: `id-${status}-${ageMs}`, status, created_at: at, finished_at: at };
}

test("an in-flight job for the same store is reused", async () => {
  for (const status of ["queued", "running"]) {
    const found = await findReusableAnalysis(
      fakeClient({ data: [row(status, 30_000)] }),
      "user-1",
      "https://store.com",
    );
    assert.equal(found?.id, `id-${status}-30000`);
    assert.equal(found?.done, false);
  }
});

test("a stuck in-flight job is NOT adopted", async () => {
  // Its Inngest run died without writing a terminal status; a new request
  // deserves a real job rather than polling a zombie forever.
  const found = await findReusableAnalysis(
    fakeClient({ data: [row("running", 40 * MINUTE)] }),
    "user-1",
    "https://store.com",
  );
  assert.equal(found, null);
});

test("a just-finished audit answers a repeat request", async () => {
  const found = await findReusableAnalysis(
    fakeClient({ data: [row("succeeded", 5 * MINUTE)] }),
    "user-1",
    "https://store.com",
  );
  assert.equal(found?.done, true);
});

test("an audit older than the reuse window does not", async () => {
  // The owner may have changed the store since — they must get a fresh read.
  const found = await findReusableAnalysis(
    fakeClient({ data: [row("succeeded", 6 * 60 * MINUTE)] }),
    "user-1",
    "https://store.com",
  );
  assert.equal(found, null);
});

test("force:true always runs a fresh audit", async () => {
  const found = await findReusableAnalysis(
    fakeClient({ data: [row("succeeded", MINUTE)] }),
    "user-1",
    "https://store.com",
    { force: true },
  );
  assert.equal(found, null);
});

test("an uploaded screenshot (no URL) has nothing to match on", async () => {
  const found = await findReusableAnalysis(
    fakeClient({ data: [row("succeeded", MINUTE)] }),
    "user-1",
    null,
  );
  assert.equal(found, null);
});

test("nothing to reuse returns null", async () => {
  assert.equal(
    await findReusableAnalysis(fakeClient({ data: [] }), "u", "https://x.com"),
    null,
  );
});

test("a database error never blocks a legitimate audit", async () => {
  const onError = await findReusableAnalysis(
    fakeClient({ error: { message: "column does not exist" } }),
    "user-1",
    "https://store.com",
  );
  assert.equal(onError, null);

  const throwing = {
    from() {
      throw new Error("connection refused");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  assert.equal(
    await findReusableAnalysis(throwing, "user-1", "https://store.com"),
    null,
  );
});
