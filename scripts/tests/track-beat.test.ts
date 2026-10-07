import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretBeat, isDevOrPreviewHost } from "../../lib/analytics/track";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36";
const HOST = "elitevaultapp.com";

test("a heartbeat never produces a page_views row (falla 1)", () => {
  const r = interpretBeat({ type: "heartbeat", path: "/a", session_id: "s" }, { ua: UA, host: HOST });
  assert.equal(r.writePageView, false);
});

test("a 3-minute visit over 2 pages = 2 page_views, not ~12", () => {
  const beats = [
    { type: "pageview" as const, path: "/" },
    ...Array.from({ length: 6 }, () => ({ type: "heartbeat" as const, path: "/" })),
    { type: "pageview" as const, path: "/pricing" },
    ...Array.from({ length: 6 }, () => ({ type: "heartbeat" as const, path: "/pricing" })),
  ];
  const n = beats.filter((b) => interpretBeat({ ...b, session_id: "s" }, { ua: UA, host: HOST }).writePageView).length;
  assert.equal(n, 2);
});

test("legacy clients (no type) are treated as heartbeats, not pageviews", () => {
  const r = interpretBeat({ path: "/a", session_id: "s" }, { ua: UA, host: HOST });
  assert.equal(r.writePageView, false);
});

test("internal pageviews are not written to page_views", () => {
  const r = interpretBeat({ type: "pageview", path: "/a", internal: true }, { ua: UA, host: HOST });
  assert.equal(r.writePageView, false);
  assert.equal(r.internal, true);
});

test("channel comes from referrer + landing query, own-site referrer is ignored", () => {
  const google = interpretBeat(
    { type: "pageview", path: "/", referrer: "https://www.google.com.ec/" },
    { ua: UA, host: HOST },
  );
  assert.equal(google.channel, "Google");
  assert.equal(google.referrerDomain, "google.com.ec");

  const reload = interpretBeat(
    { type: "pageview", path: "/app", referrer: "https://elitevaultapp.com/pricing" },
    { ua: UA, host: HOST },
  );
  assert.equal(reload.channel, "Directo");
  assert.equal(reload.referrerDomain, "Directo");
});

test("same stored first-touch inputs give the same channel on every beat (reload-safe)", () => {
  const first = { referrer: "https://l.instagram.com/", landing: "?utm_campaign=bio" };
  const a = interpretBeat({ type: "pageview", path: "/", ...first }, { ua: UA, host: HOST });
  const b = interpretBeat({ type: "pageview", path: "/app/analyzer", ...first }, { ua: UA, host: HOST });
  assert.equal(a.channel, "Instagram");
  assert.equal(b.channel, "Instagram");
  assert.equal(b.utmCampaign, "bio");
});

test("utm_source and click ids from the landing query", () => {
  const p = interpretBeat({ type: "pageview", path: "/", landing: "?utm_source=pinterest" }, { ua: UA, host: HOST });
  assert.equal(p.channel, "Pinterest");
  const ig = interpretBeat(
    { type: "pageview", path: "/", landing: "?fbclid=abc" },
    { ua: "Mozilla/5.0 Mobile Instagram 300.0", host: HOST },
  );
  assert.equal(ig.channel, "Instagram");
});

test("the Pinterest in-app browser is recorded, the crawler is dropped", () => {
  const app = interpretBeat({ type: "pageview", path: "/", landing: "?utm_source=pinterest" }, {
    ua: "Mozilla/5.0 (iPhone) Mobile/15E148 [Pinterest/iOS]",
    host: HOST,
  });
  assert.equal(app.drop, false);
  const bot = interpretBeat({ type: "pageview", path: "/" }, { ua: "Pinterest/0.2 (+http://www.pinterest.com/bot.html)", host: HOST });
  assert.equal(bot.drop, true);
});

test("dev and preview hosts are dropped", () => {
  assert.equal(isDevOrPreviewHost("localhost:3000"), true);
  assert.equal(isDevOrPreviewHost("x-abc.vercel.app"), true);
  assert.equal(isDevOrPreviewHost("elitevaultapp.com"), false);
  assert.equal(interpretBeat({ type: "pageview", path: "/" }, { ua: UA, host: "localhost:3000" }).drop, true);
});

test("path and utm values are length-capped", () => {
  const r = interpretBeat(
    { type: "pageview", path: "/" + "a".repeat(500), landing: "?utm_campaign=" + "c".repeat(500) },
    { ua: UA, host: HOST },
  );
  assert.equal(r.path!.length, 300);
  assert.ok(r.utmCampaign!.length <= 120);
});
