import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { countsTowardAnonLimit, anonLimitFilter, ANON_IN_FLIGHT_MS } from "../../lib/anon/rate-limit";
import { messages } from "../../lib/i18n/messages";

/** A failed anonymous audit must never cost the visitor their free try (owner bug, 2026-10-16). */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const NOW = Date.parse("2026-10-16T20:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

test("anonymous quota: only audits that SUCCEEDED (or are running right now) count", () => {
  const c = (row: Parameters<typeof countsTowardAnonLimit>[0]) => countsTowardAnonLimit(row, NOW);
  assert.equal(c({ status: "succeeded", created_at: ago(2 * HOUR) }), true);
  // every kind of failure is free to retry — the reported bug (a timed-out run flipped to `refunded` and blocked the retry)
  assert.equal(c({ status: "refunded", created_at: ago(2 * MIN) }), false);
  assert.equal(c({ status: "failed", created_at: ago(2 * MIN) }), false);
  // a succeeded run that only captured an anti-bot wall is not a real audit
  assert.equal(c({ status: "succeeded", created_at: ago(HOUR), result: { capture_blocked: { detected: true } } }), false);
  assert.equal(c({ status: "succeeded", created_at: ago(HOUR), result: { capture_blocked: { detected: false } } }), true);
  // running audits block parallel abuse, but only while they can plausibly still be running
  assert.equal(c({ status: "running", created_at: ago(2 * MIN) }), true);
  assert.equal(c({ status: "queued", created_at: ago(2 * MIN) }), true);
  assert.equal(c({ status: "running", created_at: ago(ANON_IN_FLIGHT_MS + MIN) }), false, "a stuck row stops counting");
  // the daily window itself
  assert.equal(c({ status: "succeeded", created_at: ago(25 * HOUR) }), false);
});

test("anonymous quota: the failed-then-retry scenario (same IP, same day) is allowed; a success then blocks", () => {
  const limit = 1;
  const used = (rows: Parameters<typeof countsTowardAnonLimit>[0][]) => rows.filter((r) => countsTowardAnonLimit(r, NOW)).length;
  const failed = { status: "refunded", created_at: ago(5 * MIN) };
  assert.ok(used([failed]) < limit, "the retry is allowed");
  assert.ok(used([failed, { status: "succeeded", created_at: ago(MIN) }]) >= limit, "…and once one succeeds the day's try is used");
});

test("the database filter mirrors the pure rule (status + window + capture_blocked) and is the one the guard uses", () => {
  const f = anonLimitFilter(NOW);
  assert.match(f, /and\(status\.eq\.succeeded,created_at\.gte\.2026-10-15T20:00:00\.000Z,or\(result->capture_blocked->>detected\.is\.null,result->capture_blocked->>detected\.eq\.false\)\)/);
  assert.match(f, /and\(status\.in\.\(queued,running\),created_at\.gte\.2026-10-16T19:45:00\.000Z\)/);
  assert.doesNotMatch(f, /refunded|failed/);
  const guard = read("lib/anon/rate-limit.ts");
  assert.match(guard, /\.or\(anonLimitFilter\(\)\)/);
  assert.doesNotMatch(guard, /\.gte\("created_at", since\)/, "no more counting every row");
});

test("the anonymous waiting screen never promises a credit refund (anonymous visitors have no credit)", () => {
  for (const locale of ["en", "es"] as const) {
    const a = (messages[locale] as unknown as { analyzing: Record<string, string> }).analyzing;
    for (const k of ["typicalAnon", "stillGoingAnon"]) {
      assert.ok(a[k], `${locale}.${k}`);
      assert.doesNotMatch(a[k], /credit|crédito/i, `${locale}.${k}`);
    }
  }
  assert.match(read("components/analyzer/anon-pending.tsx"), /<AnalyzingState[\s\S]*?anonymous\s*\/>/);
  assert.match(read("components/analyzer/analyzing-state.tsx"), /anonymous \? "analyzing\.typicalAnon" : "analyzing\.typical"/);
});
