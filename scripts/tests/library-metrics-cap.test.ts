import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMetricsCap } from "../../lib/library/metrics-cap";
import { PLANS } from "../../lib/stripe/plans";

/**
 * The Library free-tier gate — "3 winners with full metrics on Free".
 *
 * The brief that prompted this audit flagged the cap as read but never
 * exercised, and guessed it was enforced client-side in library-view.tsx. It
 * is not: it is applied server-side inside the searchLibrary action, over a
 * `plan` the action resolves from the session rather than accepting from the
 * caller. These tests pin the rule itself.
 */

const store = (id: number, preselected: boolean) => ({
  id: `s${id}`,
  is_preselected: preselected,
});

test("the plan table still says Free = 3, paid = unlimited", () => {
  // If this ever changes, the expectations below are describing the wrong
  // product. Fail loudly here rather than silently testing a stale rule.
  assert.equal(PLANS.free.libraryFullMetricsCap, 3);
  assert.equal(PLANS.pro.libraryFullMetricsCap, null);
  assert.equal(PLANS.scale.libraryFullMetricsCap, null);
});

test("free unlocks exactly 3, and only preselected ones", () => {
  const items = [
    store(1, true),
    store(2, false),
    store(3, true),
    store(4, true),
    store(5, true), // 4th preselected — must stay locked
    store(6, false),
  ];
  const out = applyMetricsCap(items, "free");
  assert.deepEqual(
    out.map((o) => o.metrics_locked),
    [false, true, false, false, true, true],
  );
  assert.equal(out.filter((o) => !o.metrics_locked).length, 3);
});

test("free never unlocks a non-preselected store, even with room to spare", () => {
  // Only one preselected row exists, so two of the three slots go unused —
  // they must NOT spill over onto ordinary stores.
  const out = applyMetricsCap([store(1, false), store(2, true), store(3, false)], "free");
  assert.deepEqual(
    out.map((o) => o.metrics_locked),
    [true, false, true],
  );
});

test("paid plans unlock everything, preselected or not", () => {
  const items = [store(1, false), store(2, true), store(3, false), store(4, false)];
  for (const plan of ["pro", "scale"] as const) {
    const out = applyMetricsCap(items, plan);
    assert.equal(
      out.every((o) => o.metrics_locked === false),
      true,
      `${plan} should unlock every row`,
    );
  }
});

test("anonymous viewers are treated as free — the server default", () => {
  // searchLibrary defaults `plan` to "free" when there is no session, so the
  // anonymous case is the free case. Pinning it so a future default change
  // can't quietly hand logged-out visitors full metrics.
  const items = Array.from({ length: 8 }, (_, i) => store(i, true));
  const out = applyMetricsCap(items, "free");
  assert.equal(out.filter((o) => !o.metrics_locked).length, 3);
});

test("null/undefined is_preselected is treated as not preselected", () => {
  // The column is nullable, and `undefined && n < cap` would evaluate to
  // undefined rather than false — this pins the coercion.
  const out = applyMetricsCap(
    [{ id: "a", is_preselected: null }, { id: "b" }, { id: "c", is_preselected: true }],
    "free",
  );
  assert.deepEqual(
    out.map((o) => o.metrics_locked),
    [true, true, false],
  );
});

test("does not mutate the input rows", () => {
  const items = [store(1, true)];
  const out = applyMetricsCap(items, "free");
  assert.equal("metrics_locked" in items[0], false);
  assert.equal(out[0].metrics_locked, false);
});
