import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

/**
 * Structural guards on app/actions/search.ts.
 *
 * Extracting the rule bought testability and created a new failure mode: the
 * rule can now be perfectly correct and simply not called. Deleting one line
 * in the action would leave all the unit tests above green, typecheck silent
 * (`metrics_locked` is optional on the row type) and the build silent
 * (next.config ignores type and lint errors) — while every free user silently
 * saw every metric. These read the source and pin the wiring.
 */
const rawSearchSource = readFileSync(
  new URL("../../app/actions/search.ts", import.meta.url),
  "utf8",
);

/**
 * Comments stripped before matching. Without this the guard is worthless: a
 * commented-out call still contains the text, so `// items = applyMetricsCap(…)`
 * would satisfy the assertion while the paywall was off. (Verified — the first
 * version of this test passed against exactly that mutation.)
 */
const searchSource = rawSearchSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/([^:])\/\/.*$/gm, "$1");

test("searchLibrary actually calls the cap", () => {
  assert.match(
    searchSource,
    /^\s*items\s*=\s*applyMetricsCap\(\s*items\s*,\s*plan\s*\)/m,
    "search.ts must assign the capped items back — a commented-out or " +
      "discarded call means every free user sees every metric",
  );
});

test("the plan is resolved from the session, never accepted from the caller", () => {
  // This is what makes the gate unspoofable. `opts` is the caller-supplied
  // object; a `plan` field appearing there would let a client ask for pro.
  const optsBlock = searchSource.slice(
    searchSource.indexOf("export async function searchLibrary"),
    searchSource.indexOf("}): Promise<"),
  );
  assert.equal(
    /\bplan\b\s*\??:/.test(optsBlock),
    false,
    "searchLibrary's options must not accept a `plan` — it comes from the session",
  );
  assert.match(
    searchSource,
    /let plan[^\n]*=\s*"free"/,
    "plan must default to free when there is no session",
  );
  assert.match(
    searchSource,
    /supabase\s*\n?\s*\.from\("profiles"\)\s*\n?\s*\.select\("plan"\)/,
    "plan must be read from the profiles row for the authenticated user",
  );
});

test("null/undefined is_preselected is treated as not preselected", () => {
  // The column is nullable. (The `Boolean()` wrapper added during extraction
  // changed nothing observable — `!undefined` was already `true` — but this
  // pins the behaviour against a future rewrite to an explicit `=== false`.)
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
