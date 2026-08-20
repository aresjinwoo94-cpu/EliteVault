import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  readDiscoveryCache,
  writeDiscoveryCache,
  discoveryCacheTtlMs,
} from "../../lib/discovery-cache";
import { urlHash } from "../../lib/image-hash";
import type { DiscoverySummary } from "../../lib/site-discovery";

/**
 * WP-1 — the discovery cache. Its whole value is skipping a 10s-capped HTML
 * fetch on a re-audit, and its whole risk is doing something OTHER than that:
 * failing an audit, or feeding the model a stale/malformed page. These tests
 * pin both sides.
 */

const ORIGINAL_TTL = process.env.DISCOVERY_CACHE_TTL_MINUTES;
afterEach(() => {
  if (ORIGINAL_TTL === undefined) delete process.env.DISCOVERY_CACHE_TTL_MINUTES;
  else process.env.DISCOVERY_CACHE_TTL_MINUTES = ORIGINAL_TTL;
});

function summary(over: Partial<DiscoverySummary> = {}): DiscoverySummary {
  return {
    pageUrls: ["https://store.com"],
    prices: ["$29"],
    title: "Store",
    description: null,
    platform: "shopify",
    headings: [],
    bodyExcerpt: null,
    reviewSnippets: [],
    ratingSignal: null,
    trustSignals: [],
    faqQuestions: [],
    ctaTexts: [],
    imageAlts: [],
    challengeDetected: false,
    challengeVendor: null,
    ...over,
  };
}

/** Records the query chain so tests can assert on the filters applied. */
function fakeService(opts: {
  read?: { data?: unknown };
  throwOn?: "select" | "upsert";
}) {
  const calls: {
    table?: string;
    eq: [string, unknown][];
    gte: [string, unknown][];
    upsert?: Record<string, unknown>;
  } = { eq: [], gte: [] };
   
  const chain: any = {
    select() {
      if (opts.throwOn === "select") throw new Error("relation does not exist");
      return chain;
    },
    eq(col: string, val: unknown) {
      calls.eq.push([col, val]);
      return chain;
    },
    gte(col: string, val: unknown) {
      calls.gte.push([col, val]);
      return chain;
    },
    async maybeSingle() {
      return opts.read ?? { data: null };
    },
    async upsert(row: Record<string, unknown>) {
      if (opts.throwOn === "upsert") throw new Error("relation does not exist");
      calls.upsert = row;
      return { error: null };
    },
  };
   
  const service: any = {
    from(table: string) {
      calls.table = table;
      return chain;
    },
  };
  return { service, calls };
}

test("a cached payload is returned and keyed by the URL hash", async () => {
  const payload = summary();
  const { service, calls } = fakeService({ read: { data: { payload } } });
  const got = await readDiscoveryCache(service, "https://store.com");
  assert.deepEqual(got, payload);
  assert.equal(calls.table, "discovery_cache");
  assert.deepEqual(calls.eq, [["url_hash", urlHash("https://store.com")]]);
});

test("freshness is enforced in the query, not after the read", async () => {
  // A stale row must never come back at all — there is no code path that could
  // then use it by mistake.
  process.env.DISCOVERY_CACHE_TTL_MINUTES = "60";
  const { service, calls } = fakeService({ read: { data: { payload: summary() } } });
  await readDiscoveryCache(service, "https://store.com");
  assert.equal(calls.gte.length, 1);
  assert.equal(calls.gte[0][0], "updated_at");
  const cutoff = new Date(calls.gte[0][1] as string).getTime();
  const expected = Date.now() - 60 * 60_000;
  assert.ok(Math.abs(cutoff - expected) < 5_000, "cutoff should be ~60min ago");
});

test("a miss returns null rather than a half-built summary", async () => {
  const { service } = fakeService({ read: { data: null } });
  assert.equal(await readDiscoveryCache(service, "https://store.com"), null);
});

test("a malformed payload is rejected, not passed to the analyzer", async () => {
  // A truncated row would reach the prompt as undefined fields — a silent
  // quality regression that's much worse than simply re-fetching.
  const { service } = fakeService({ read: { data: { payload: { title: "x" } } } });
  assert.equal(await readDiscoveryCache(service, "https://store.com"), null);
});

test("a missing table degrades to a normal fetch instead of failing the audit", async () => {
  const { service } = fakeService({ throwOn: "select" });
  assert.equal(await readDiscoveryCache(service, "https://store.com"), null);
});

test("a failing write is swallowed — the cache never breaks an audit", async () => {
  const { service } = fakeService({ throwOn: "upsert" });
  await writeDiscoveryCache(service, "https://store.com", summary());
});

test("a write stores the payload under the same key the reader uses", async () => {
  const payload = summary();
  const { service, calls } = fakeService({});
  await writeDiscoveryCache(service, "https://store.com", payload);
  assert.equal(calls.upsert?.url_hash, urlHash("https://store.com"));
  assert.equal(calls.upsert?.url, "https://store.com");
  assert.deepEqual(calls.upsert?.payload, payload);
});

test("TTL=0 disables the cache on both sides without a deploy", async () => {
  process.env.DISCOVERY_CACHE_TTL_MINUTES = "0";
  assert.equal(discoveryCacheTtlMs(), 0);
  const { service, calls } = fakeService({ read: { data: { payload: summary() } } });
  assert.equal(await readDiscoveryCache(service, "https://store.com"), null);
  await writeDiscoveryCache(service, "https://store.com", summary());
  assert.equal(calls.table, undefined, "no query should have been issued");
});

test("a nonsense TTL falls back to the default instead of disabling the cache", () => {
  process.env.DISCOVERY_CACHE_TTL_MINUTES = "not-a-number";
  assert.equal(discoveryCacheTtlMs(), 180 * 60_000);
  process.env.DISCOVERY_CACHE_TTL_MINUTES = "-5";
  assert.equal(discoveryCacheTtlMs(), 180 * 60_000);
});
