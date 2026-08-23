import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WP-E — cost attribution, and the rule that it must never cost anything.
 *
 * Metering is the lowest-stakes code in the feature and has the highest
 * potential to do damage, because it runs inside the two paths that matter:
 * the preview a merchant is watching, and the export they have just paid for.
 * A throw in either would turn a bookkeeping detail into a failed purchase.
 *
 * The other property is honesty. Blocks is the first feature here whose main
 * cost isn't tokens, and the temptation was to price the headless browser with
 * a plausible-looking number. A fabricated figure sitting in the same column as
 * the real inference costs is worse than a zero, because nothing downstream can
 * tell them apart.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOf = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("the browser's cost rate is never invented", () => {
  // The duration is measured, so it's a fact. The price per second depends on
  // the plan, the memory setting and the region — none of which this repo can
  // know — so it comes from the environment and defaults to zero.
  const src = codeOf(read("lib/blocks/browser-cost.ts"));
  assert.ok(src.includes("BLOCKS_BROWSER_USD_PER_SECOND"));
  assert.ok(
    /Number\.isFinite\(raw\)\s*&&\s*raw\s*>=\s*0\s*\?\s*raw\s*:\s*0/.test(src),
    "the rate should fall back to 0, not to a guess",
  );
  // A hardcoded per-second price would be exactly the invention this avoids.
  assert.ok(
    !/0\.0000\d|usdPerSecond\s*=\s*[\d.]+/.test(src),
    "a cost rate appears to be hardcoded",
  );
});

test("the duration is recorded even when no rate is configured", () => {
  // So a rate supplied later can be applied to rows already written, instead of
  // the history being unrecoverable.
  const src = codeOf(read("lib/blocks/browser-cost.ts"));
  assert.ok(src.includes("durationMs"));
  assert.ok(
    src.includes("usdPerSecond: usdPerSecond()"),
    "the rate in force isn't stamped on the row",
  );
});

test("a browser session is metered even when the preview fails", () => {
  // A run that dies after launching still spent the compute. Recording only
  // successes would understate exactly the case worth watching — the store that
  // times out on every attempt.
  const src = codeOf(read("inngest/functions/blocks-preview.ts"));
  const finallyBlock = src.slice(src.lastIndexOf("} finally {"));
  assert.ok(
    finallyBlock.includes("recordBrowserCost"),
    "the browser cost is recorded outside `finally`, so failures go uncounted",
  );
  assert.ok(finallyBlock.includes("succeeded: browserOk"));
});

test("the timer starts before the browser launches", () => {
  // The cold Chromium start is the biggest and least predictable slice of the
  // cost. Starting the clock after launch would omit precisely the part nobody
  // can otherwise estimate.
  const src = codeOf(read("inngest/functions/blocks-preview.ts"));
  const started = src.indexOf("browserStartedAt = Date.now()");
  const launched = src.indexOf("launchBlocksBrowser()");
  assert.ok(started !== -1 && launched !== -1);
  assert.ok(started < launched, "the timer starts after the launch it should include");
});

test("metering can never fail the work it is measuring", () => {
  // recordUsage is already fire-and-forget; this is about the layer above it.
  const src = codeOf(read("lib/blocks/browser-cost.ts"));
  assert.ok(src.includes("try {") && src.includes("catch"));
  assert.ok(
    !src.includes("await "),
    "recordBrowserCost awaits something — it must not delay the caller",
  );
});

test("both Blocks paths attribute their cost to the same feature", () => {
  // One event_type, or the cost page shows two unrelated things and neither
  // total is the feature's.
  for (const [file, needle] of [
    ["inngest/functions/blocks-preview.ts", 'eventType: "blocks"'],
    ["app/actions/blocks-export.ts", 'eventType: "blocks"'],
    ["lib/blocks/browser-cost.ts", 'eventType: "blocks"'],
  ] as const) {
    assert.ok(codeOf(read(file)).includes(needle), `${file} isn't attributed to "blocks"`);
  }
});

test("the export records which plan the buyer was on", () => {
  // A snapshot for COGS-per-tier, not a gate — the export is available on every
  // plan. Without it every export row landed with plan null and the question
  // "what does an export cost us per tier" had no answer.
  const body = codeOf(read("app/actions/blocks-export.ts"));
  assert.ok(body.includes("runWithMeter"));
  assert.ok(
    /plan,\s*\n\s*eventType: "blocks"/.test(body),
    "the meter context for the export carries no plan",
  );
});

test("a non-inference cost reaches the column that gets summed", () => {
  // recordUsage prices by MODEL, and "chromium" isn't in that table — so
  // without an explicit override the browser cost would sit in `meta` where
  // nothing adds it up, and the ledger would say the feature was free.
  const meter = codeOf(read("lib/usage/meter.ts"));
  assert.ok(meter.includes("estCostUsdOverride"));
  assert.ok(
    codeOf(read("lib/blocks/browser-cost.ts")).includes("estCostUsdOverride"),
    "the browser cost doesn't use the override",
  );
});

test("the override is opt-in, so a mispriced AI model still reports zero", () => {
  // A fallback would be the wrong shape: an inference call whose model is
  // missing from PRICING should be FIXED by adding the model, not by having
  // some other number quietly substituted.
  const meter = codeOf(read("lib/usage/meter.ts"));
  assert.ok(
    /typeof rec\.estCostUsdOverride === "number"/.test(meter),
    "the override isn't an explicit opt-in",
  );
  assert.ok(meter.includes("estimateCostUsd(rec.model"), "the model path was removed");
});

test("the browser row carries no fake tokens", () => {
  // It isn't an inference call. Non-zero tokens would corrupt the totals the
  // cost page sums across genuinely token-based work.
  const src = codeOf(read("lib/blocks/browser-cost.ts"));
  assert.ok(src.includes("promptTokens: 0"));
  assert.ok(src.includes("outputTokens: 0"));
  assert.ok(src.includes("totalTokens: 0"));
});
