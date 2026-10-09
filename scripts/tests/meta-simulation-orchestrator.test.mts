import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * Orchestrator contract (brief §4.2 item 6): a simulation is ONE AI call (the
 * narrative), never one per scenario, and a failing/garbage model response must
 * not cost the user the numbers.
 */
const providerUrl = pathToFileURL(resolve(import.meta.dirname, "../../ai/provider.ts")).href;

let calls = 0;
let behaviour: () => unknown = () => ({});
mock.module(providerUrl, {
  exports: {
    getProvider: async () => ({
      name: "gemini",
      generateStructured: async () => {
        calls++;
        return behaviour();
      },
    }),
  },
});

const { runMetaSimulation } = await import("../../ai/agents/run-meta-simulation");

const base = {
  url: "https://acme.com",
  score: 62,
  summary: "A decent store with a weak hero.",
  niche: "skincare",
  aovUsd: 60,
  dailyBudgetUsd: 100,
  productMarginPct: 40,
  now: new Date("2026-10-09T12:00:00Z"),
};

const goodNarr = (tag: string) => ({
  summary: `${tag} summary with the given figures`,
  win_condition: `${tag} win condition`,
  risks: ["risk one", "risk two"],
  recommendation: `${tag} recommendation to act on`,
});

beforeEach(() => {
  calls = 0;
  behaviour = () => ({ conservative: goodNarr("c"), balanced: goodNarr("b"), aggressive: goodNarr("a") });
});

test("a full simulation is exactly ONE AI call, numbers from the engine, text from the model", async () => {
  const r = await runMetaSimulation(base);
  assert.equal(calls, 1);
  assert.deepEqual(r.errors, []);
  assert.equal(r.balanced!.summary, "b summary with the given figures");
  assert.equal(r.balanced!.days.length, 7);
  assert.ok(r.balanced!.totals.roas_range);
  assert.equal(r.balanced!.economics!.break_even_roas, 2.5); // 100 / 40
  assert.ok(r.conservative!.totals.roas <= r.balanced!.totals.roas && r.balanced!.totals.roas <= r.aggressive!.totals.roas);
});

test("a provider failure (429 / 503 / timeout) still ships all three scenarios with numbers", async () => {
  behaviour = () => {
    throw new Error("429 RESOURCE_EXHAUSTED quota");
  };
  const r = await runMetaSimulation(base);
  assert.equal(calls, 1, "no retry storm: one attempt");
  for (const v of ["conservative", "balanced", "aggressive"] as const) {
    assert.ok(r[v], v);
    assert.equal(r[v]!.days.length, 7);
    assert.ok(r[v]!.totals.spend > 0);
    assert.match(r[v]!.summary, /not a guarantee/i);
  }
  assert.deepEqual(r.errors, []);
});

test("garbage model output falls back too (one bad scenario text ⇒ whole deterministic narrative)", async () => {
  behaviour = () => ({ conservative: goodNarr("c"), balanced: { summary: "" }, aggressive: goodNarr("a") });
  const r = await runMetaSimulation(base);
  assert.equal(calls, 1);
  assert.match(r.balanced!.summary, /not a guarantee/i);
});

test("the model cannot change a number: totals are identical with or without it", async () => {
  const ok = await runMetaSimulation(base);
  behaviour = () => {
    throw new Error("boom");
  };
  const fb = await runMetaSimulation(base);
  assert.deepEqual(ok.balanced!.totals, fb.balanced!.totals);
  assert.deepEqual(ok.aggressive!.days, fb.aggressive!.days);
});
