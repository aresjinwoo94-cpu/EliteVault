import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDomain,
  canonicalUrl,
  metaAdLibraryUrl,
} from "../../lib/library/domain";
import {
  judgeStore,
  momentumScore,
  estRevenueRange,
  type StoreFacts,
} from "../../lib/library/quality";

/**
 * FASE A's credibility guarantees, as tests.
 *
 * `normalizeDomain` is the dedup key: it and the unique index in migration
 * 0017 are the only thing standing between the Library and the same store
 * appearing three times. `judgeStore` is the publication gate — the only path
 * a row can take to become visible in a user's report.
 */

test("normalizeDomain collapses every spelling of the same store", () => {
  const forms = [
    "https://www.Foo.com/collections/all?utm=1",
    "HTTP://FOO.COM",
    "foo.com/",
    "www.foo.com",
    "foo.com.",
    "https://foo.com:443/#hero",
  ];
  for (const f of forms) assert.equal(normalizeDomain(f), "foo.com", f);
});

test("normalizeDomain keeps distinct stores distinct", () => {
  assert.equal(normalizeDomain("shop.foo.com"), "shop.foo.com");
  assert.notEqual(normalizeDomain("foo.co"), normalizeDomain("foo.com"));
});

test("normalizeDomain refuses junk instead of storing it", () => {
  for (const junk of ["", "   ", "not a domain", "localhost", "foo", "://", null, undefined]) {
    assert.equal(normalizeDomain(junk as string), null, String(junk));
  }
});

test("canonicalUrl always produces an https URL we can link to", () => {
  assert.equal(canonicalUrl("WWW.Foo.com/path"), "https://foo.com");
  assert.equal(canonicalUrl("garbage"), null);
});

test("metaAdLibraryUrl builds a public, active-only search link", () => {
  const url = metaAdLibraryUrl("Drunk Elephant");
  assert.ok(url.startsWith("https://www.facebook.com/ads/library/?"));
  assert.ok(url.includes("active_status=active"));
  assert.ok(url.includes("q=Drunk+Elephant"));
});

// ── Publication gate ──────────────────────────────────────────────────────

const good: StoreFacts = {
  url: "https://foo.com",
  domain: "foo.com",
  title: "Foo",
  niche: "skincare",
  isLive: true,
  hasImage: true,
  activeAdsCount: 40,
  internalScore: null,
};

test("a complete, live, signal-backed store publishes", () => {
  const v = judgeStore(good);
  assert.equal(v.status, "published");
  assert.deepEqual(v.reasons, []);
});

test("anything missing parks the row in review, with the reason", () => {
  const cases: [Partial<StoreFacts>, string][] = [
    [{ isLive: false }, "site not live"],
    [{ niche: null }, "no niche assigned"],
    [{ title: "  " }, "missing title"],
    [{ domain: "junk", url: "junk" }, "unresolvable domain"],
    [{ hasImage: false }, "no thumbnail or favicon"],
    [{ activeAdsCount: null, internalScore: null }, "no signal (no active ads, no internal score)"],
  ];
  for (const [patch, reason] of cases) {
    const v = judgeStore({ ...good, ...patch });
    assert.equal(v.status, "review", JSON.stringify(patch));
    assert.ok(v.reasons.includes(reason), `expected reason: ${reason}`);
  }
});

test("an internal score alone is signal enough", () => {
  assert.equal(
    judgeStore({ ...good, activeAdsCount: null, internalScore: 72 }).status,
    "published",
  );
});

// ── Momentum ──────────────────────────────────────────────────────────────

test("momentumScore ranks the actively-advertising store higher", () => {
  const spending = momentumScore({ activeAdsCount: 120, convRate: 3, trafficEst: 500_000 });
  const quiet = momentumScore({ activeAdsCount: 2, convRate: 3, trafficEst: 500_000 });
  assert.ok(spending !== null && quiet !== null);
  assert.ok(spending > quiet);
});

test("momentumScore stays inside 0-100 and never returns NaN", () => {
  const extreme = momentumScore({
    activeAdsCount: 5000,
    convRate: 20,
    trafficEst: 90_000_000,
  });
  assert.ok(extreme !== null && extreme <= 100 && extreme >= 0);
  assert.ok(Number.isFinite(extreme));
});

test("momentumScore decays a stale ad count", () => {
  const now = new Date("2026-07-22T00:00:00Z");
  const fresh = momentumScore({
    activeAdsCount: 100,
    adsCheckedAt: "2026-07-20T00:00:00Z",
    now,
  });
  const stale = momentumScore({
    activeAdsCount: 100,
    adsCheckedAt: "2026-04-01T00:00:00Z",
    now,
  });
  assert.ok(fresh !== null && stale !== null);
  assert.ok(stale < fresh, "a count we haven't rechecked in months weighs less");
});

test("momentumScore returns null when there is no signal at all", () => {
  assert.equal(momentumScore({}), null);
  assert.equal(
    momentumScore({ activeAdsCount: null, convRate: null, trafficEst: null }),
    null,
  );
  assert.equal(
    momentumScore({ activeAdsCount: NaN, convRate: -3, trafficEst: 0 }),
    null,
  );
});

// ── Revenue model ─────────────────────────────────────────────────────────

test("estRevenueRange returns a range, never a point figure", () => {
  const r = estRevenueRange("skincare", 4, 500_000);
  assert.ok(r);
  assert.ok(r.low < r.high, "always a range — never a figure attributed to the brand");
  assert.ok(Number.isFinite(r.low) && Number.isFinite(r.high));
});

test("estRevenueRange refuses to invent a number from missing inputs", () => {
  assert.equal(estRevenueRange("skincare", null, 500_000), null);
  assert.equal(estRevenueRange("skincare", 4, null), null);
  assert.equal(estRevenueRange("skincare", 0, 0), null);
  assert.equal(estRevenueRange(null, NaN, 500_000), null);
});

test("an unknown niche still models cleanly on the default AOV", () => {
  const r = estRevenueRange("underwater-basket-weaving", 3, 100_000);
  assert.ok(r && r.low > 0);
});
