import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveNiche,
  loadNicheWinnersModule,
} from "../../lib/library/niche-winners";

/**
 * The "Winners in your niche" module is an ENRICHMENT. The audit the user paid
 * a credit for must render whether or not this works, so every failure mode
 * has to resolve to null rather than throw.
 *
 * Note these tests run with NO Supabase credentials in the environment, which
 * makes the Library query fail for real — exactly the "the data layer is
 * broken" case we need to survive.
 */

test("resolveNiche maps a store domain to a Library niche", () => {
  assert.equal(resolveNiche({ url: "https://glowskincare.com" }), "skincare");
  assert.equal(resolveNiche({ url: "https://www.runsneakers.io" }), "footwear");
});

test("resolveNiche falls back to the audit summary when the domain is opaque", () => {
  assert.equal(
    resolveNiche({
      url: "https://xk92lab.com",
      summary: "A supplement brand selling a daily greens powder.",
    }),
    "wellness",
  );
});

test("resolveNiche returns null rather than guessing", () => {
  assert.equal(resolveNiche({ url: "https://xk92lab.com" }), null);
  assert.equal(resolveNiche({ url: null, summary: null }), null);
  assert.equal(resolveNiche({ url: null }), null);
});

test("resolveNiche survives a malformed URL", () => {
  // Uploaded-screenshot audits and hand-typed URLs both land here.
  assert.doesNotThrow(() => resolveNiche({ url: "not a url" }));
  assert.equal(
    resolveNiche({ url: "not a url", summary: "premium dog harnesses" }),
    "pet",
  );
});

test("the module is skipped entirely until the audit itself succeeded", async () => {
  for (const status of ["queued", "running", "failed", "refunded"]) {
    const mod = await loadNicheWinnersModule({
      status,
      url: "https://glowskincare.com",
      summary: null,
      isPaid: true,
    });
    assert.equal(mod, null, `status "${status}" must not render the module`);
  }
});

test("an undetectable niche hides the module instead of failing the report", async () => {
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: "https://xk92lab.com",
    summary: null,
    isPaid: true,
  });
  assert.equal(mod, null);
});

test("a broken Library data layer degrades to null, never throws", async () => {
  // No Supabase env here, so the service client blows up inside the module.
  // The report around it must still render.
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: "https://glowskincare.com",
    summary: "clean skincare serums",
    isPaid: true,
  });
  assert.equal(mod, null);
});

test("a null URL (uploaded screenshot) is handled without throwing", async () => {
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: null,
    summary: null,
    isPaid: false,
  });
  assert.equal(mod, null);
});
