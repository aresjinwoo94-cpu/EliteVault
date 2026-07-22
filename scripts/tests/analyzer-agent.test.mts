import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * The audit's failure behaviour, with a fake model in place of a real one.
 *
 * Covers the two ways a generation goes wrong in production:
 *   • the model returns output that doesn't match the schema (used to fail the
 *     audit and refund; now gets one repair pass),
 *   • the step runs out of wall-clock budget (must fail cleanly rather than be
 *     cut off by the platform with a 504).
 *
 * Requires Node's experimental module mocking — see the `test` npm script.
 */

const providerModule = pathToFileURL(
  resolve(import.meta.dirname, "../../ai/provider.ts"),
).href;

/** A valid audit object, used as the model's "good" answer. */
const GOOD = {
  score: 61,
  scenarios: {
    organic: 0.03,
    meta_ads_bad: 0.005,
    meta_ads_regular: 0.012,
    meta_ads_good: 0.025,
  },
  category_scores: {
    color_integration: 60,
    layout_proportion: 60,
    image_quality: 60,
    technical_optimization: 60,
    niche_coherence: 60,
    cro_principles: 60,
  },
  buyer_persona_response: {
    headline: "I can't tell what this store sells.",
    quotes: ["What is this?"],
    would_buy: false,
    reasons: ["Unclear offer"],
  },
  annotations: [],
  summary: "The hero never states the offer.",
  top_fixes: [
    { title: "State the offer in the H1", impact: "high", effort: "S", why: "Cold traffic bounces." },
  ],
};

/**
 * The provider module is mocked ONCE (Node refuses to re-mock a module), and
 * each test swaps the behaviour behind it.
 */
type Handler = (callIndex: number) => Promise<unknown>;
let primaryHandler: Handler = async () => GOOD;
let fallbackHandler: Handler | null = null;
let calls: { provider: string }[] = [];

mock.module(providerModule, {
  exports: {
    resolveAnalyzerProviders: async () => {
      let primaryCalls = 0;
      let fallbackCalls = 0;
      return {
        primary: {
          name: "gemini",
          generateStructured: async () => {
            calls.push({ provider: "primary" });
            return primaryHandler(primaryCalls++);
          },
        },
        fallback: fallbackHandler
          ? {
              name: "anthropic",
              generateStructured: async () => {
                calls.push({ provider: "fallback" });
                return fallbackHandler!(fallbackCalls++);
              },
            }
          : null,
      };
    },
  },
});

const { runAnalyzerAgent } = await import("../../ai/agents/analyzer-agent");

function withProvider(primary: Handler, fallback: Handler | null = null) {
  primaryHandler = primary;
  fallbackHandler = fallback;
  calls = [];
}

const INPUT = {
  screenshotBase64: "AAAA",
  mediaType: "image/jpeg" as const,
  url: "https://store.com",
};

test("invalid model output gets one repair pass instead of failing the audit", async () => {
  // First answer is missing required blocks; the repair pass returns a good one.
  withProvider(async (i) => (i === 0 ? { score: 61, summary: "nope" } : GOOD));

  const result = await runAnalyzerAgent({
    ...INPUT,
    deadlineAt: Date.now() + 60_000,
  });
  assert.equal(result.score, 61);
  assert.equal(calls.length, 2, "should have retried exactly once");
});

test("output that stays invalid fails loudly, naming the offending fields", async () => {
  withProvider(async () => ({ score: 999 }));
  await assert.rejects(
    runAnalyzerAgent({ ...INPUT, deadlineAt: Date.now() + 60_000 }),
    /failed validation/,
  );
});

test("with no budget left, the repair pass is skipped rather than started", async () => {
  // Starting a call we can't finish is what produced the platform 504.
  withProvider(async () => ({ score: 999 }));
  await assert.rejects(
    runAnalyzerAgent({ ...INPUT, deadlineAt: Date.now() + 500 }),
    /failed validation/,
  );
  assert.equal(calls.length, 1, "must not start a second call it can't finish");
});

test("a provider failure falls back to the other provider", async () => {
  withProvider(async () => {
    throw new Error("Gemini: empty response");
  }, async () => GOOD);

  const result = await runAnalyzerAgent({
    ...INPUT,
    deadlineAt: Date.now() + 60_000,
  });
  assert.equal(result.score, 61);
  assert.deepEqual(
    calls.map((c) => c.provider),
    ["primary", "fallback"],
  );
});

test("a budget-exhausted failure does NOT start the fallback provider", async () => {
  withProvider(async () => {
    throw new Error("Step budget exhausted (gemini) — not enough time left.");
  }, async () => GOOD);

  await assert.rejects(
    runAnalyzerAgent({ ...INPUT, deadlineAt: Date.now() + 60_000 }),
    /budget exhausted/,
  );
  assert.deepEqual(
    calls.map((c) => c.provider),
    ["primary"],
    "a second attempt would be cut off by the platform, not completed",
  );
});
