import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchNicheGroundingPriors,
  renderGroundingBlock,
  type GroundingContext,
} from "../../lib/library/grounding";

/**
 * Brief §2.3 + §7 — grounding must be a no-op by default (latency budget) and
 * degrade to nothing on any failure (fallback). It's a soft prior, never a
 * dependency of the audit.
 */

test("§7 latency budget — grounding is a no-op when the flag is off", async () => {
  delete process.env.ANALYZER_NICHE_GROUNDING; // default OFF
  const before = Date.now();
  const result = await fetchNicheGroundingPriors({
    url: "https://someskincarestore.com",
    hint: "skincare serum",
  });
  // Off → returns immediately without ever touching Supabase.
  assert.equal(result, null);
  assert.ok(Date.now() - before < 200, "flag-off path must not do any I/O");
});

test("§2.3 fallback — an unresolvable niche returns null (no DB call)", async () => {
  process.env.ANALYZER_NICHE_GROUNDING = "true";
  try {
    const result = await fetchNicheGroundingPriors({
      url: "https://xyz.example", // no niche keywords
      hint: "",
    });
    assert.equal(result, null);
  } finally {
    delete process.env.ANALYZER_NICHE_GROUNDING;
  }
});

test("§2.2/§2.3 — the grounding block labels real vs estimated signals", () => {
  const ctx: GroundingContext = {
    nicheLabel: "Skincare",
    demandProxy: 42,
    priors: [
      { brand: "Acme Skin", activeAds: 30, estRevenue: { low: 50000, high: 120000 } },
      { brand: "Dewy Co", activeAds: 12, estRevenue: null },
    ],
  };
  const block = renderGroundingBlock(ctx);
  assert.match(block, /\[real_signal\]/); // active ads tagged real
  assert.match(block, /\[ai_estimate\]/); // modeled revenue tagged estimate
  assert.match(block, /Niche demand proxy \(sum of real active ads\): 42/);
  assert.match(block, /never as measured fact/);
  // A prior without revenue still renders without inventing a number.
  assert.match(block, /Dewy Co: 12 active Meta ads \[real_signal\]; revenue estimate unavailable/);
});
