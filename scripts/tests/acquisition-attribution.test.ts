import { test } from "node:test";
import assert from "node:assert/strict";
import { attributeSignup, isFreshProfile, profileAcqFromVisitor } from "../../lib/analytics/attribution";

/** docs/owner-monitor-v2.md §3.3 — ev_anon → user at sign-up, best-effort. */

const NOW = Date.parse("2026-10-10T12:00:00Z");

test("a profile created minutes ago is fresh; an old one is not", () => {
  assert.equal(isFreshProfile("2026-10-10T11:55:00Z", NOW), true);
  assert.equal(isFreshProfile("2026-10-01T11:55:00Z", NOW), false);
  assert.equal(isFreshProfile(null, NOW), false);
});

test("profile acquisition columns are copied from the visitor's first touch", () => {
  assert.deepEqual(
    profileAcqFromVisitor({
      first_channel: "TikTok",
      first_referrer_domain: "tiktok.com",
      utm_campaign: "launch",
      first_landing_path: "/analyzer",
    }),
    { acq_channel: "TikTok", acq_referrer_domain: "tiktok.com", acq_utm_campaign: "launch", acq_landing_path: "/analyzer" },
  );
});

function fakeStore(over: Partial<{ profile: any; visitor: any; failAt: string }> = {}) {
  const calls: string[] = [];
  const store = {
    calls,
    getProfile: async () => {
      if (over.failAt === "getProfile") throw new Error("db down");
      return over.profile === undefined ? { created_at: "2026-10-10T11:58:00Z", acq_channel: null } : over.profile;
    },
    getVisitor: async (anon: string) => {
      calls.push("getVisitor:" + anon);
      return over.visitor === undefined
        ? { anon_id: anon, user_id: null, first_channel: "TikTok", first_referrer_domain: "tiktok.com", utm_campaign: null, first_landing_path: "/" }
        : over.visitor;
    },
    linkVisitor: async (anon: string, uid: string) => void calls.push(`link:${anon}:${uid}`),
    setProfileAcq: async (uid: string, acq: any) => void calls.push(`acq:${uid}:${acq.acq_channel}`),
  };
  return store;
}

test("a new user who arrived via TikTok is linked and gets acq_channel TikTok", async () => {
  const s = fakeStore();
  const r = await attributeSignup(s, { anonId: "anon-1", userId: "u1", now: NOW });
  assert.equal(r, "linked");
  assert.deepEqual(s.calls, ["getVisitor:anon-1", "link:anon-1:u1", "acq:u1:TikTok"]);
});

test("no ev_anon cookie → nothing happens", async () => {
  const s = fakeStore();
  assert.equal(await attributeSignup(s, { anonId: undefined, userId: "u1", now: NOW }), "skipped");
  assert.deepEqual(s.calls, []);
});

test("returning (non-fresh) profile is never re-attributed on login", async () => {
  const s = fakeStore({ profile: { created_at: "2026-09-01T00:00:00Z", acq_channel: null } });
  assert.equal(await attributeSignup(s, { anonId: "a", userId: "u1", now: NOW }), "skipped");
  assert.deepEqual(s.calls, []);
});

test("an already attributed profile is left alone", async () => {
  const s = fakeStore({ profile: { created_at: "2026-10-10T11:58:00Z", acq_channel: "Google" } });
  assert.equal(await attributeSignup(s, { anonId: "a", userId: "u1", now: NOW }), "skipped");
});

test("a visitor already linked to another user is not stolen", async () => {
  const s = fakeStore({ visitor: { anon_id: "a", user_id: "someone-else", first_channel: "X" } });
  assert.equal(await attributeSignup(s, { anonId: "a", userId: "u1", now: NOW }), "skipped");
  assert.ok(!s.calls.some((c) => c.startsWith("link:")));
});

test("unknown visitor (tracker never saw them) → skipped", async () => {
  const s = fakeStore({ visitor: null });
  assert.equal(await attributeSignup(s, { anonId: "a", userId: "u1", now: NOW }), "skipped");
});

test("any DB error is swallowed — attribution never breaks the login", async () => {
  const s = fakeStore({ failAt: "getProfile" });
  assert.equal(await attributeSignup(s, { anonId: "a", userId: "u1", now: NOW }), "error");
});
