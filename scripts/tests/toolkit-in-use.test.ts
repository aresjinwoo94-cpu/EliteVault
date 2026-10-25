import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_AI_VISITS,
  MIN_AUDITS,
  MIN_STORES,
  aiVisitsToShow,
  roundDownCount,
  visibleCounters,
} from "../../lib/marketing/in-use";

test("counters round DOWN and never up", () => {
  assert.equal(roundDownCount(97), 90);
  assert.equal(roundDownCount(253), 250);
  assert.equal(roundDownCount(999), 950);
  assert.equal(roundDownCount(1299), 1200);
  assert.equal(roundDownCount(0), 0);
  assert.equal(roundDownCount(NaN), 0);
});

test("a counter below its threshold is not shown; the block needs at least 2", () => {
  // audits below 100 are dropped, stores 97 + niches 11 still make 2
  const some = visibleCounters({ audits: MIN_AUDITS - 1, stores: 97, niches: 11 });
  assert.deepEqual(some.map((c) => c.key), ["stores", "niches"]);
  // everything real
  const all = visibleCounters({ audits: 253, stores: 97, niches: 11 });
  assert.deepEqual(all, [
    { key: "audits", value: 250 },
    { key: "stores", value: 90 },
    { key: "niches", value: 11 },
  ]);
  // only one survives -> whole block hidden
  assert.deepEqual(visibleCounters({ audits: 5, stores: MIN_STORES - 1, niches: 11 }), []);
});

test("a failed or unconfigured query (null) hides that counter instead of showing 0", () => {
  assert.deepEqual(
    visibleCounters({ audits: null, stores: 97, niches: 11 }).map((c) => c.key),
    ["stores", "niches"],
  );
  assert.deepEqual(visibleCounters({ audits: null, stores: null, niches: 11 }), []);
});

test("the AI-assistants line needs real data above the threshold", () => {
  assert.equal(aiVisitsToShow(null), null);
  assert.equal(aiVisitsToShow(MIN_AI_VISITS - 1), null);
  assert.equal(aiVisitsToShow(MIN_AI_VISITS), MIN_AI_VISITS);
});
