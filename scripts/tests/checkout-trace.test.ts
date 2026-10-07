import { test } from "node:test";
import assert from "node:assert/strict";
import { originSummary, authProviderLabel } from "../../lib/admin/trace";

test("known acquisition channel is reported with its landing and campaign", () => {
  const o = originSummary({ channel: "TikTok", referrer: "tiktok.com", campaign: "launch", landing: "/analyzer" });
  assert.equal(o.known, true);
  assert.match(o.text, /TikTok/);
  assert.match(o.text, /launch/);
  assert.match(o.text, /\/analyzer/);
});

test("no attribution is said plainly, not guessed", () => {
  const o = originSummary({ channel: null, referrer: null, campaign: null, landing: null });
  assert.equal(o.known, false);
  assert.match(o.text, /Sin rastro/);
});

test("a Directo channel is still a known (direct) origin", () => {
  assert.equal(originSummary({ channel: "Directo" }).known, true);
});

test("auth provider labels", () => {
  assert.equal(authProviderLabel("google"), "Google");
  assert.equal(authProviderLabel("email"), "Email (magic link)");
  assert.equal(authProviderLabel(undefined), "—");
});
