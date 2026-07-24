import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveNiche,
  loadNicheWinnersModule,
  gateWinners,
  seededWindow,
  type NicheWinner,
  type NicheWinnersResult,
} from "../../lib/library/niche-winners";
import { nicheWinnersEnabled } from "../../lib/flags";

/**
 * The "Winners in your niche" module is an ENRICHMENT. The audit the user paid
 * a credit for must render whether or not this works, so every failure mode
 * has to resolve to null rather than throw.
 *
 * Note these tests run with NO Supabase credentials in the environment, which
 * makes the Library query fail for real — exactly the "the data layer is
 * broken" case we need to survive.
 *
 * The flag is read at CALL time, so each test sets it explicitly. Without this
 * every assertion below would pass trivially (flag defaults to off).
 */
function withFlag(on: boolean) {
  process.env.ENABLE_NICHE_WINNERS = on ? "true" : "false";
}

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

test("the feature flag defaults to OFF and is what gates the module", async () => {
  delete process.env.ENABLE_NICHE_WINNERS;
  assert.equal(nicheWinnersEnabled(), false);

  withFlag(false);
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: "https://glowskincare.com",
    summary: "clean skincare serums",
    isPaid: true,
  });
  assert.equal(mod, null, "flag off must short-circuit before any query");
});

test("the flag accepts the usual truthy spellings", () => {
  for (const on of ["1", "true", "TRUE", "on", "yes"]) {
    process.env.ENABLE_NICHE_WINNERS = on;
    assert.equal(nicheWinnersEnabled(), true, on);
  }
  for (const off of ["0", "false", "off", "no", ""]) {
    process.env.ENABLE_NICHE_WINNERS = off;
    assert.equal(nicheWinnersEnabled(), false, off);
  }
});

// ── Freemium gating ───────────────────────────────────────────────────────
// The rule the whole upsell rests on: Free must see one REAL winner (the aha)
// and must never receive the data for the locked ones.

function winner(domain: string): NicheWinner {
  return {
    title: domain,
    domain,
    url: `https://${domain}`,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    nicheLabel: "Skincare",
    exactMatch: true,
    matchPct: 100,
    activeAds: 47,
    adsUrl: "https://www.facebook.com/ads/library/?q=test",
    revenue: { low: 80_000, high: 150_000 },
  };
}
const three: NicheWinnersResult = {
  niche: "skincare",
  nicheLabel: "Skincare",
  winners: [winner("a.com"), winner("b.com"), winner("c.com")],
};

test("Pro/Scale receive all three winners, unlocked", () => {
  const mod = gateWinners(three, true);
  assert.ok(mod);
  assert.equal(mod.locked, false);
  assert.equal(mod.winners.length, 3);
  assert.equal(mod.lockedCount, 0);
});

test("Free receives exactly one real winner plus a locked COUNT", () => {
  const mod = gateWinners(three, false);
  assert.ok(mod);
  assert.equal(mod.locked, true);
  assert.equal(mod.winners.length, 1, "the aha is previewed, not paywalled");
  assert.equal(mod.winners[0].domain, "a.com");
  assert.equal(mod.lockedCount, 2);
});

test("the locked rows' data never leaves the server for a Free viewer", () => {
  const mod = gateWinners(three, false);
  const payload = JSON.stringify(mod);
  assert.ok(payload.includes("a.com"), "the visible winner IS sent");
  for (const hidden of ["b.com", "c.com"]) {
    assert.ok(
      !payload.includes(hidden),
      `${hidden} must not appear anywhere in the Free payload`,
    );
  }
});

test("a single winner leaves nothing to lock (no empty lock overlay)", () => {
  const one = { ...three, winners: [winner("a.com")] };
  const mod = gateWinners(one, false);
  assert.ok(mod);
  assert.equal(mod.winners.length, 1);
  assert.equal(mod.lockedCount, 0);
});

test("an empty winner list produces no module at all", () => {
  assert.equal(gateWinners({ ...three, winners: [] }, true), null);
  assert.equal(gateWinners({ ...three, winners: [] }, false), null);
});

// ── Per-store variety (seededWindow) ──────────────────────────────────────
// Two stores in the same niche used to see the identical top 3, which read as
// canned. A per-store window over the top pool fixes it — deterministically.

test("seededWindow gives different stores different windows over the pool", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g"];
  const s1 = seededWindow(pool, 3, "storeone.com");
  const s2 = seededWindow(pool, 3, "another-shop.io");
  assert.equal(s1.length, 3);
  assert.equal(s2.length, 3);
  assert.notDeepEqual(s1, s2, "distinct seeds should not always collide");
});

test("seededWindow is deterministic — the same store always gets the same trio", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g"];
  assert.deepEqual(
    seededWindow(pool, 3, "urbanwear.co"),
    seededWindow(pool, 3, "urbanwear.co"),
  );
});

test("seededWindow returns everything (no throw) when the pool can't fill", () => {
  assert.deepEqual(seededWindow(["a", "b"], 3, "x"), ["a", "b"]);
  assert.deepEqual(seededWindow([], 3, "x"), []);
});

test("seededWindow always returns `count` distinct items from a big enough pool", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g"];
  for (const seed of ["one", "two", "three", "four", "five"]) {
    const w = seededWindow(pool, 3, seed);
    assert.equal(w.length, 3, seed);
    assert.equal(new Set(w).size, 3, `no repeats for ${seed}`);
  }
});

test("the module is skipped entirely until the audit itself succeeded", async () => {
  withFlag(true);
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
  withFlag(true);
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: "https://xk92lab.com",
    summary: null,
    isPaid: true,
  });
  assert.equal(mod, null);
});

test("a broken Library data layer degrades to null, never throws", async () => {
  withFlag(true);
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

test("a broken data layer degrades for Free viewers too", async () => {
  withFlag(true);
  // Free takes a different branch (1 visible + a locked count) — it must fail
  // the same way, with no half-built module and no leak of a locked row.
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: "https://glowskincare.com",
    summary: "clean skincare serums",
    isPaid: false,
  });
  assert.equal(mod, null);
});

test("a null URL (uploaded screenshot) is handled without throwing", async () => {
  withFlag(true);
  const mod = await loadNicheWinnersModule({
    status: "succeeded",
    url: null,
    summary: null,
    isPaid: false,
  });
  assert.equal(mod, null);
});
