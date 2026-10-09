import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * Fix Tracks route contract (brief §3.6): ownership, gating, cache, one AI call.
 * Supabase, the anon cookie, i18n and the agent are mocked; the DB fake
 * implements the same semantics as the three SQL functions in migration 0036
 * (the real SQL is the contract — these tests pin the route's use of it).
 */

const u = (p: string) => pathToFileURL(resolve(import.meta.dirname, "../..", p)).href;

type Row = Record<string, unknown>;
let analyses: Row[] = [];
let profiles: Record<string, string> = {};
let teardowns: { domain: string; teardown: unknown }[] = [];
let authUser: { id: string } | null = null;
let anonToken: string | null = null;
let agentCalls = 0;
let agentResult: { fixes: unknown[]; haystack: string } | null = null;
let missingColumn = false;
let teardownError = false;

function state(row: Row): Record<string, unknown> {
  return (row.fix_tracks as Record<string, unknown>) ?? {};
}

const rpcs: Record<string, (a: Record<string, unknown>) => unknown> = {
  fix_tracks_choose: ({ p_id, p_track }) => {
    const row = analyses.find((r) => r.id === p_id)!;
    if (!state(row).free_choice) row.fix_tracks = { ...state(row), free_choice: p_track };
    return state(row).free_choice ?? null;
  },
  fix_tracks_claim: ({ p_id, p_track }) => {
    const row = analyses.find((r) => r.id === p_id)!;
    const cur = state(row)[p_track as string] as { fixes?: unknown; pending_at?: string; attempts?: number } | undefined;
    const stale = cur?.pending_at && Date.now() - new Date(cur.pending_at).getTime() > 30_000;
    if (!cur || (!cur.fixes && stale && (cur.attempts ?? 0) < 3)) {
      row.fix_tracks = { ...state(row), [p_track as string]: { pending_at: new Date().toISOString(), attempts: (cur?.attempts ?? 0) + 1 } };
      return true;
    }
    return false;
  },
  fix_tracks_store: ({ p_id, p_track, p_value }) => {
    const row = analyses.find((r) => r.id === p_id)!;
    row.fix_tracks = { ...state(row), [p_track as string]: p_value };
    return null;
  },
};

function builder(table: string) {
  let filters: [string, unknown][] = [];
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    in: () => b,
    not: () => b,
    maybeSingle: async () => {
      if (missingColumn && table === "analyses") return { data: null, error: { code: "42703", message: "column fix_tracks does not exist" } };
      if (table === "analyses") return { data: analyses.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null };
      if (table === "profiles") {
        const id = filters.find(([c]) => c === "id")?.[1] as string;
        return { data: { plan: profiles[id] ?? "free" }, error: null };
      }
      return { data: null, error: null };
    },
    then: (res: (v: unknown) => unknown) =>
      res(table === "winning_sites" && teardownError ? { data: null, error: { message: "db down" } } : { data: table === "winning_sites" ? teardowns : [], error: null }),
  };
  return b;
}

mock.module(u("lib/supabase/server.ts"), {
  exports: {
    createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: authUser } }) } }),
    createSupabaseServiceClient: () => ({
      from: builder,
      rpc: async (name: string, args: Record<string, unknown>) => ({ data: rpcs[name](args), error: null }),
    }),
  },
});
mock.module(u("lib/anon/session.ts"), { exports: { getAnonToken: async () => anonToken } });
mock.module(u("lib/i18n/server.ts"), { exports: { getLocale: async () => "en" } });
mock.module(u("ai/agents/fix-track-agent.ts"), {
  exports: {
    runFixTrack: async () => {
      agentCalls++;
      return agentResult;
    },
  },
});

process.env.ANALYZER_FIX_TRACKS = "true";
const { GET } = await import("../../app/api/analyses/[id]/fix-tracks/[track]/route");

const goodFixes = [1, 2, 3].map((i) => ({
  title: `Fix number ${i}`,
  impact: "high",
  effort: "S",
  why: `why ${i}`,
  evidence: `evidence ${i} from the page`,
}));

const teardown = { summary: "s", elements: [{ element: "Hero", dimension: "cro_principles", observation: "o", takeaway: "t" }] };

function baseRow(over: Row = {}): Row {
  return {
    id: "a1",
    status: "succeeded",
    url: "https://acme.com",
    user_id: "u1",
    anon_id: null,
    result: { summary: "x", capture_blocked: { detected: false } },
    niche_winners: {
      scope: "niche",
      nicheLabel: "Footwear",
      winners: [{ domain: "top.com", title: "Top", url: "https://top.com", exactMatch: true, activeAds: 5, revenue: null }],
    },
    fix_tracks: null,
    ...over,
  };
}

async function call(track: string, id = "a1") {
  const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id, track }) });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => {
  analyses = [baseRow()];
  profiles = { u1: "free" };
  teardowns = [{ domain: "top.com", teardown }];
  authUser = { id: "u1" };
  anonToken = null;
  agentCalls = 0;
  agentResult = { fixes: goodFixes, haystack: "" };
  missingColumn = false;
  teardownError = false;
  process.env.ANALYZER_FIX_TRACKS = "true";
});

test("flag off → 404, nothing runs", async () => {
  process.env.ANALYZER_FIX_TRACKS = "false";
  assert.equal((await call("post_purchase")).status, 404);
  assert.equal(agentCalls, 0);
});

test("invalid track → 400; unauthenticated → 401; unknown analysis → 404", async () => {
  assert.equal((await call("nope")).status, 400);
  authUser = null;
  assert.equal((await call("post_purchase")).status, 401);
  authUser = { id: "u1" };
  assert.equal((await call("post_purchase", "zzz")).status, 404);
});

test("another user's analysis → 403 and no AI call", async () => {
  authUser = { id: "intruder" };
  assert.equal((await call("post_purchase")).status, 403);
  assert.equal(agentCalls, 0);
});

test("analysis not succeeded → 409; capture_blocked → 409 with no generation", async () => {
  analyses[0].status = "running";
  assert.equal((await call("post_purchase")).status, 409);
  analyses[0].status = "succeeded";
  analyses[0].result = { summary: "x", capture_blocked: { detected: true } };
  const r = await call("post_purchase");
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "capture_blocked");
  assert.equal(agentCalls, 0);
});

test("missing migration 0036 fails closed (503), not a crash", async () => {
  missingColumn = true;
  assert.equal((await call("post_purchase")).status, 503);
});

test("cache: a second GET does not call the provider again", async () => {
  profiles.u1 = "pro";
  const first = await call("post_purchase");
  assert.equal(first.status, 200);
  assert.equal(first.body.cached, false);
  assert.equal(agentCalls, 1);
  const second = await call("post_purchase");
  assert.equal(second.body.cached, true);
  assert.equal(agentCalls, 1);
});

test("free: picks one track (fix #1 full, #2+ stripped), a second distinct track is locked with 0 AI calls", async () => {
  const a = await call("post_purchase");
  assert.equal(a.status, 200);
  assert.equal(a.body.choice, "post_purchase");
  assert.equal(a.body.fixes[0].evidence, "evidence 1 from the page");
  assert.equal(a.body.fixes[1].locked, true);
  assert.equal(a.body.fixes[1].evidence, undefined);
  assert.equal(agentCalls, 1);

  const b = await call("theme_colors");
  assert.equal(b.status, 403);
  assert.equal(b.body.error, "locked");
  assert.equal(b.body.choice, "post_purchase");
  const c = await call("urgent");
  assert.equal(c.status, 403);
  assert.equal(agentCalls, 1);
});

test("free choosing `urgent` costs 0 AI calls and still locks the choice", async () => {
  const a = await call("urgent");
  assert.equal(a.status, 200);
  assert.equal(a.body.fixes, null);
  assert.equal(agentCalls, 0);
  assert.equal((await call("competitor")).status, 403);
  assert.equal(agentCalls, 0);
});

test("pro/scale: all four tracks open", async () => {
  profiles.u1 = "scale";
  for (const t of ["urgent", "post_purchase", "theme_colors", "competitor"]) {
    assert.equal((await call(t)).status, 200, t);
  }
  assert.equal(agentCalls, 3);
});

test("anonymous: own cookie works and picks one; a foreign cookie → 403; claimed analysis not served", async () => {
  authUser = null;
  analyses = [baseRow({ user_id: null, anon_id: "tok-1" })];
  anonToken = "tok-OTHER";
  assert.equal((await call("post_purchase")).status, 403);
  assert.equal(agentCalls, 0);
  anonToken = "tok-1";
  const ok = await call("theme_colors");
  assert.equal(ok.status, 200);
  assert.equal(ok.body.viewer, "anon");
  assert.equal((await call("post_purchase")).status, 403);
  assert.equal(agentCalls, 1);
});

test("competitor with no same-niche winner holding a teardown → honest empty state, 0 AI calls, nothing cached", async () => {
  profiles.u1 = "pro";
  teardowns = [];
  const r = await call("competitor");
  assert.equal(r.status, 200);
  assert.equal(r.body.empty, "no_competitor");
  assert.equal(agentCalls, 0);
  assert.equal(state(analyses[0]).competitor, undefined);
});

test("competitor with a teardown generates once and returns the competitor card data", async () => {
  profiles.u1 = "pro";
  const r = await call("competitor");
  assert.equal(r.status, 200);
  assert.equal(r.body.meta.competitor.domain, "top.com");
  assert.equal(agentCalls, 1);
});

test("generation failure → 502, nothing cached; an immediate retry is held off (cool-down), no second AI call", async () => {
  profiles.u1 = "pro";
  agentResult = null;
  assert.equal((await call("post_purchase")).status, 502);
  assert.equal(agentCalls, 1);
  const again = await call("post_purchase");
  assert.equal(again.status, 202);
  assert.equal(again.body.pending, true);
  assert.equal(agentCalls, 1);
  assert.equal((state(analyses[0]).post_purchase as { fixes?: unknown }).fixes, undefined);
});

test("a track already claimed by another request is not generated again (second gets 202)", async () => {
  profiles.u1 = "pro";
  rpcs.fix_tracks_claim({ p_id: "a1", p_track: "theme_colors" }); // request A holds the claim
  const second = await call("theme_colors");
  assert.equal(second.status, 202);
  assert.equal(second.body.pending, true);
  assert.equal(agentCalls, 0);
});

test("free user hitting an empty competitor state does NOT burn the one free choice", async () => {
  teardowns = [];
  const r = await call("competitor");
  assert.equal(r.body.empty, "no_competitor");
  assert.equal(r.body.choice, null);
  assert.equal(state(analyses[0]).free_choice, undefined);
  // …so the free user can still pick another track afterwards.
  assert.equal((await call("post_purchase")).status, 200);
});

test("winning_sites query error is a 503, not a fake empty state, and burns nothing", async () => {
  teardownError = true;
  const r = await call("competitor");
  assert.equal(r.status, 503);
  assert.equal(state(analyses[0]).free_choice, undefined);
  assert.equal(agentCalls, 0);
});

test("after 3 failed attempts the track stops spending AI (429)", async () => {
  profiles.u1 = "pro";
  analyses[0].fix_tracks = { post_purchase: { pending_at: new Date(Date.now() - 60_000).toISOString(), attempts: 3 } };
  const r = await call("post_purchase");
  assert.equal(r.status, 429);
  assert.equal(r.body.error, "attempts_exhausted");
  assert.equal(agentCalls, 0);
});
