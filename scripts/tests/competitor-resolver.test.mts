import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * resolveCompetitor: which store the `competitor` Fix Track benchmarks against.
 * Always SAME niche; first the audit's own stored winners, then the niche's best teardown
 * in the Library (the stored window is only 3 of a niche's ~7 stores, and teardowns exist
 * for one store per niche — without the fallback most audits would see "coming soon").
 */

type Row = Record<string, unknown>;
let byDomainRows: Row[] = [];
let nicheRows: Row[] = [];
let failStage: "domain" | "niche" | null = null;
const queries: string[] = [];

mock.module(pathToFileURL(resolve(import.meta.dirname, "../../lib/supabase/server.ts")).href, {
  exports: {
    createSupabaseServiceClient: () => ({
      from: () => {
        let kind: "domain" | "niche" = "domain";
        const b: Record<string, unknown> = {
          select: () => b,
          in: () => ((kind = "domain"), b),
          eq: (c: string, v: unknown) => {
            if (c === "niche") {
              kind = "niche";
              queries.push(`niche=${String(v)}`);
            }
            return b;
          },
          not: () => b,
          order: () => b,
          limit: () => b,
          then: (res: (v: unknown) => unknown) => {
            if (failStage === kind) return res({ data: null, error: { message: "db down" } });
            return res({ data: kind === "domain" ? byDomainRows : nicheRows, error: null });
          },
        };
        return b;
      },
    }),
  },
});

const { resolveCompetitor } = await import("../../lib/analyzer/fix-tracks-data");

const TD = { summary: "s", elements: [{ element: "Hero", dimension: "cro_principles", observation: "obs obs obs obs", takeaway: "take take take take" }] };
const winner = (domain: string, over: Row = {}) => ({ title: domain, domain, url: `https://${domain}`, exactMatch: true, activeAds: 5, revenue: null, ...over });
const stored = (niche: string, winners: Row[], scope = "niche") => ({ niche, nicheLabel: niche, scope, winners });

beforeEach(() => {
  byDomainRows = [];
  nicheRows = [];
  failStage = null;
  queries.length = 0;
});

test("a stored same-niche winner that holds a teardown wins (no niche-level query needed)", async () => {
  byDomainRows = [{ domain: "a.com", teardown: TD }];
  const r = await resolveCompetitor(stored("pet", [winner("a.com"), winner("b.com")]), "https://mine.com");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.winner.domain, "a.com");
  assert.equal(queries.length, 0);
});

test("none of the 3 stored winners has a teardown ⇒ falls back to the niche's own teardown store", async () => {
  byDomainRows = [];
  nicheRows = [{ domain: "farm.com", title: "The Farm", url: "https://farm.com", favicon_url: null, active_ads_count: 90, est_revenue_low: 1, est_revenue_high: 9, teardown: TD }];
  const r = await resolveCompetitor(stored("pet", [winner("a.com"), winner("b.com"), winner("c.com")]), "https://mine.com");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.winner.domain, "farm.com");
    assert.equal(r.winner.exactMatch, true);
    assert.equal(r.winner.title, "The Farm");
  }
  assert.deepEqual(queries, ["niche=pet"], "the fallback is scoped to the detected niche only");
});

test("a store is never its own competitor (stored winners AND niche fallback)", async () => {
  byDomainRows = [{ domain: "mine.com", teardown: TD }];
  nicheRows = [{ domain: "mine.com", teardown: TD }];
  const r = await resolveCompetitor(stored("pet", [winner("mine.com")]), "https://www.mine.com/products/x");
  assert.deepEqual(r, { ok: false, reason: "none" });
});

test("a global (unclassified) audit or an unknown niche never gets a competitor", async () => {
  nicheRows = [{ domain: "farm.com", teardown: TD }];
  assert.deepEqual(await resolveCompetitor(stored("", [winner("a.com")], "global"), null), { ok: false, reason: "none" });
  assert.deepEqual(await resolveCompetitor(stored("not-a-niche", []), null), { ok: false, reason: "none" });
  assert.deepEqual(await resolveCompetitor(null, null), { ok: false, reason: "none" });
  assert.equal(queries.length, 0);
});

test("a niche with no teardown store ⇒ honest 'none' (button stays 'coming soon')", async () => {
  const r = await resolveCompetitor(stored("wellness", [winner("a.com")]), null);
  assert.deepEqual(r, { ok: false, reason: "none" });
});

test("a database error is 'error', never a fake 'none'", async () => {
  failStage = "domain";
  assert.deepEqual(await resolveCompetitor(stored("pet", [winner("a.com")]), null), { ok: false, reason: "error" });
  failStage = "niche";
  assert.deepEqual(await resolveCompetitor(stored("pet", []), null), { ok: false, reason: "error" });
});

test("a teardown with no elements doesn't count", async () => {
  nicheRows = [{ domain: "farm.com", teardown: { summary: "s", elements: [] } }];
  assert.deepEqual(await resolveCompetitor(stored("pet", []), null), { ok: false, reason: "none" });
});
