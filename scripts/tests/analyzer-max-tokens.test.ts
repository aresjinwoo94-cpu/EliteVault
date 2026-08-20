import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * WP-C — the ANALYZER_MAX_TOKENS bound.
 *
 * This exists because the first version of that knob shipped a real bug that a
 * six-line test would have caught: it accepted values up to the provider's
 * 32768 retry cap, and at EXACTLY that value truncation recovery silently
 * stops working. The retry in ai/providers/gemini.ts computes
 * `wider = min(base * 2, TRUNCATION_TOKEN_CAP)` and only fires when
 * `wider > base`, so at the cap there is no wider ceiling left — a recoverable
 * truncation turns into a hard failure and a refunded audit.
 *
 * The parse is module-scoped, so each case re-imports with a cache-buster.
 */

const TRUNCATION_TOKEN_CAP = 32_768;

async function ceilingFor(value: string | undefined): Promise<number> {
  const previous = process.env.ANALYZER_MAX_TOKENS;
  if (value === undefined) delete process.env.ANALYZER_MAX_TOKENS;
  else process.env.ANALYZER_MAX_TOKENS = value;
  const mod = await import(
    `../../ai/agents/analyzer-agent?maxtok=${encodeURIComponent(String(value))}`
  );
  if (previous === undefined) delete process.env.ANALYZER_MAX_TOKENS;
  else process.env.ANALYZER_MAX_TOKENS = previous;
  return (mod as { ANALYZER_MAX_TOKENS_FOR_TEST: number })
    .ANALYZER_MAX_TOKENS_FOR_TEST;
}

test("the default is unchanged at 8192", async () => {
  assert.equal(await ceilingFor(undefined), 8192);
});

test("a value that would disable truncation recovery is refused", async () => {
  // THE regression. Any accepted ceiling must leave room for one doubling.
  const got = await ceilingFor(String(TRUNCATION_TOKEN_CAP));
  assert.equal(got, 8192, "32768 must fall back, not be accepted");
  assert.ok(
    Math.min(got * 2, TRUNCATION_TOKEN_CAP) > got,
    "the accepted ceiling must still have a wider ceiling to retry with",
  );
});

test("every accepted value leaves a wider ceiling to retry with", async () => {
  for (const v of ["4096", "8192", "12000", "16384"]) {
    const got = await ceilingFor(v);
    assert.ok(
      Math.min(got * 2, TRUNCATION_TOKEN_CAP) > got,
      `${v} accepted as ${got}, which disables the truncation retry`,
    );
  }
});

test("in-range values are honoured", async () => {
  assert.equal(await ceilingFor("16384"), 16384);
  assert.equal(await ceilingFor("4096"), 4096);
  assert.equal(await ceilingFor("12000.6"), 12001);
});

test("out-of-range and garbage fall back rather than surprising", async () => {
  for (const v of ["0", "-1", "100", "40000", "abc", "", "Infinity", "NaN"]) {
    assert.equal(await ceilingFor(v), 8192, `"${v}" should fall back to 8192`);
  }
});
