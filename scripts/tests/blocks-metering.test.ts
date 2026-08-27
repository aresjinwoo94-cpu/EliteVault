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

test("the browser's cost rate is never invented", async () => {
  // The duration is measured, so it's a fact. The price per second depends on
  // the plan, the memory setting and the region — none of which this repo can
  // know — so it comes from the environment, and with nothing configured the
  // honest answer is zero rather than a plausible-looking figure sitting in the
  // same column as the real inference costs.
  //
  // Run, not regex-matched. The previous version asserted the exact shape of
  // the expression that computes this and broke the moment it was rewritten,
  // while a genuinely invented rate would have passed.
  const { browserCostUsd } = await import("../../lib/blocks/browser-cost");
  const original = process.env.BLOCKS_BROWSER_USD_PER_SECOND;
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const unset of [undefined, "", "   "]) {
      if (unset === undefined) delete process.env.BLOCKS_BROWSER_USD_PER_SECOND;
      else process.env.BLOCKS_BROWSER_USD_PER_SECOND = unset;
      const out = browserCostUsd(30_000);
      assert.equal(out.usdPerSecond, 0, `rate for ${JSON.stringify(unset)}`);
      assert.equal(out.estCostUsd, 0, "a cost appeared from nowhere");
    }

    // A rate the owner actually supplies is used, and used correctly.
    process.env.BLOCKS_BROWSER_USD_PER_SECOND = "0.0002";
    assert.equal(browserCostUsd(30_000).estCostUsd, 0.006);

    // Garbage falls back to zero rather than to a guess. "0,5" is the European
    // decimal comma, the realistic way this gets mistyped.
    for (const bad of ["0,5", "cheap", "-1", "NaN", "Infinity"]) {
      process.env.BLOCKS_BROWSER_USD_PER_SECOND = bad;
      assert.equal(browserCostUsd(30_000).estCostUsd, 0, `rate ${bad}`);
    }
  } finally {
    console.warn = warn;
    if (original === undefined) delete process.env.BLOCKS_BROWSER_USD_PER_SECOND;
    else process.env.BLOCKS_BROWSER_USD_PER_SECOND = original;
  }
});

test("the duration is written into the row, not merely named in a signature", async () => {
  // The previous version asserted `src.includes("durationMs")`, which the
  // PARAMETER NAME satisfies on its own. Deleting the line that puts the
  // duration in `meta` — destroying the retroactive-repricing property this
  // exists to protect — left the test passing. It checked that a word appeared
  // in a file.
  //
  // Now it runs the thing. No Supabase env is configured here, so the insert
  // fails inside recordUsageNow and is swallowed — which is exactly the
  // behaviour criterion 2 demands, and makes this a real test of it too.
  const { recordBrowserCost } = await import("../../lib/blocks/browser-cost");
  const seen: unknown[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => seen.push(args);
  try {
    await recordBrowserCost({
      userId: null,
      plan: null,
      projectId: "p1",
      durationMs: 4200,
      succeeded: true,
    });
  } finally {
    console.warn = warn;
  }
  // Returning at all is the assertion: no throw, no rejection, no hang.
  assert.ok(true);

  // And the value genuinely reaches the payload.
  const src = codeOf(read("lib/blocks/browser-cost.ts"));
  assert.ok(
    /durationMs:\s*Math\.round\(opts\.durationMs\)/.test(src),
    "the measured duration never reaches the row",
  );
  // The rate in force is stamped alongside it, so a rate configured LATER can
  // be applied to rows already written instead of the history being lost.
  assert.ok(
    /usdPerSecond:\s*rate/.test(src),
    "the rate in force isn't stamped on the row",
  );
});

test("metering survives having no database at all", async () => {
  // Criterion 2, exercised rather than asserted about. SUPABASE_SERVICE_ROLE_KEY
  // is read with a non-null assertion, so createSupabaseServiceClient throws
  // synchronously when it's absent — the one path most likely to take a preview
  // down with it.
  const { recordUsageNow } = await import("../../lib/usage/meter");
  const warn = console.warn;
  console.warn = () => {};
  try {
    await recordUsageNow({ eventType: "blocks", model: "chromium" });
  } finally {
    console.warn = warn;
  }
  assert.ok(true, "recordUsageNow rejected — it must never reject");
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
  // Matches however the browser is obtained. WP-F.5 replaced the direct
  // `launchBlocksBrowser()` with `acquireBlocksBrowser()` (a warm pool), and a
  // test naming one specific function failed a correct implementation — the
  // property is about ORDER, not about which call does the acquiring.
  const acquired = src.search(/(acquire|launch)BlocksBrowser\(/);
  assert.ok(started !== -1, "the browser timer is gone");
  assert.ok(acquired !== -1, "nothing acquires a browser — this test needs updating");
  assert.ok(started < acquired, "the timer starts after the launch it should include");
});

test("the browser row is written before the browser is closed", () => {
  // `browser.close()` has no timeout, so a wedged Chromium hangs the teardown —
  // and the cost row would be lost in exactly the expensive case it exists to
  // capture. The few milliseconds of teardown that go unmeasured are the better
  // trade.
  const src = codeOf(read("inngest/functions/blocks-preview.ts"));
  const tail = src.slice(src.lastIndexOf("} finally {"));
  const record = tail.indexOf("recordBrowserCost");
  const close = tail.indexOf("closeQuietly");
  assert.ok(record !== -1 && close !== -1, "the finally block changed shape");
  assert.ok(
    record < close,
    "the cost is recorded after closeQuietly, which can hang and lose the row",
  );
});

test("the last write of the invocation is awaited, not detached", () => {
  // recordUsage detaches its insert, which is right when more work follows the
  // call. Here the handler returns immediately afterwards and the instance can
  // be frozen mid-flight, so the one row WP-E exists to write would be the one
  // most likely to vanish.
  //
  // Replaces an earlier assertion that browser-cost.ts contained no `await` at
  // all. That was a trap: it policed a file that couldn't delay anyone, would
  // have failed on any unrelated async helper, and missed real blocking done
  // without the keyword.
  const src = codeOf(read("inngest/functions/blocks-preview.ts"));
  assert.ok(
    /await recordBrowserCost\(/.test(src),
    "the browser cost is fired and forgotten at the end of the invocation",
  );
  const meter = codeOf(read("lib/usage/meter.ts"));
  assert.ok(
    meter.includes("export async function recordUsageNow"),
    "there is no awaitable write for callers whose insert is the last thing they do",
  );
  assert.ok(
    meter.includes("void recordUsageNow(rec)"),
    "recordUsage should delegate, so both paths share one implementation",
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

test("both paths record which plan the user was on", () => {
  // A snapshot for COGS-per-tier, not a gate — the export is available on every
  // plan. Without it the rows landed with plan null and "what does this cost us
  // per tier" had no answer.
  //
  // The earlier version matched `/plan,\s*\n\s*eventType/`, i.e. SOURCE
  // FORMATTING: reordering two object properties, or Prettier joining the
  // lines, would have failed a correct implementation.
  const exp = codeOf(read("app/actions/blocks-export.ts"));
  assert.ok(exp.includes("runWithMeter"));
  assert.ok(
    /select\("plan"\)/.test(exp) && /\bplan\b/.test(exp),
    "the export never reads the buyer's plan",
  );

  // The browser row passes it explicitly rather than relying on the ALS context
  // surviving into an Inngest step callback — a bet that, if lost, would leave
  // browser rows with plan null while export rows had it, silently.
  const preview = codeOf(read("inngest/functions/blocks-preview.ts"));
  assert.ok(
    /recordBrowserCost\(\{[\s\S]{0,200}?plan:/.test(preview),
    "the browser cost row doesn't pass a plan explicitly",
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
