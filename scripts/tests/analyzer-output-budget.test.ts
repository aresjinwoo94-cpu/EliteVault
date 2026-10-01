import { test } from "node:test";
import assert from "node:assert/strict";
import { ANALYSIS_TOOL_SCHEMA } from "../../ai/schemas";

/**
 * Latency guard (docs/analyzer-latency.md): on Vercel Hobby's 50s step the
 * vision call's generation time is what decides whether an audit fits one step
 * or forces a retry. Output SIZE is the model-independent lever the author
 * flagged (ai/agents/analyzer-agent.ts), so these caps are load-bearing for
 * latency, not cosmetics — this test stops a future edit from quietly letting
 * the audit balloon back to a count that no longer fits the budget.
 *
 * The caps also reach the Anthropic fallback provider, which consumes the tool
 * schema directly (Gemini strips maxItems, so for it the PROMPT enforces the
 * same numbers — kept in sync by hand).
 */

type ToolObj = {
  properties: Record<string, { maxItems?: number; properties?: Record<string, { maxItems?: number }> }>;
};
const props = (ANALYSIS_TOOL_SCHEMA as unknown as ToolObj).properties;

test("annotations are capped at 6 (was 8) to keep the audit inside the step budget", () => {
  assert.equal(props.annotations.maxItems, 6);
});

test("top_fixes are capped at 6 (was 8)", () => {
  assert.equal(props.top_fixes.maxItems, 6);
});

test("persona quotes and reasons are capped at 4 (was 6)", () => {
  assert.equal(props.buyer_persona_response.properties?.quotes.maxItems, 4);
  assert.equal(props.buyer_persona_response.properties?.reasons.maxItems, 4);
});

/** Re-import the agent with a cache-buster so the module-scoped env read re-runs. */
async function hedgeFor(value: string | undefined): Promise<number> {
  const prev = process.env.ANALYZER_HEDGE_AFTER_MS;
  if (value === undefined) delete process.env.ANALYZER_HEDGE_AFTER_MS;
  else process.env.ANALYZER_HEDGE_AFTER_MS = value;
  const mod = await import(
    `../../ai/agents/analyzer-agent?hedge=${encodeURIComponent(String(value))}`
  );
  if (prev === undefined) delete process.env.ANALYZER_HEDGE_AFTER_MS;
  else process.env.ANALYZER_HEDGE_AFTER_MS = prev;
  return (mod as { ANALYZER_HEDGE_AFTER_MS_FOR_TEST: number })
    .ANALYZER_HEDGE_AFTER_MS_FOR_TEST;
}

test("the forced vision-call hedge defaults to 9s (lowered from 12s)", async () => {
  assert.equal(await hedgeFor(undefined), 9_000);
});

test("ANALYZER_HEDGE_AFTER_MS overrides the default, and 0 disables the forced hedge", async () => {
  assert.equal(await hedgeFor("6000"), 6_000);
  assert.equal(await hedgeFor("0"), 0);
  // Garbage falls back to the default rather than surprising.
  assert.equal(await hedgeFor("abc"), 9_000);
  assert.equal(await hedgeFor("-5"), 9_000);
});
