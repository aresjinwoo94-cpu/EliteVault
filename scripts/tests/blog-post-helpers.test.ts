import { test } from "node:test";
import assert from "node:assert/strict";
import { blogCta, blogFigure, evidenceBlock, simulatorReplica, CTA_CLASS, EVIDENCE_ATTR, EV_OPEN, EV_CLOSE } from "../../lib/blog/post-helpers";

test("blogCta carries all four UTMs, the slug and the position, and links to the signup→analyzer route", () => {
  const html = blogCta("how-to-increase-roas", "showcase", "See your store's 7-day ROAS scenarios →");
  assert.match(html, new RegExp(`^<p class="${CTA_CLASS}">`));
  assert.ok(html.includes('href="/sign-up?next=/app/analyzer&amp;utm_source=blog&amp;utm_medium=inline&amp;utm_campaign=how-to-increase-roas&amp;utm_content=showcase"'));
  assert.ok(html.includes("See your store's 7-day ROAS scenarios →"));
});

test("blogCta supports a lead sentence and a custom target without breaking the query string", () => {
  const html = blogCta("x", "early", "Go →", { lead: "Short lead.", target: "/pricing" });
  assert.ok(html.includes("Short lead. <a "));
  assert.ok(html.includes('href="/pricing?utm_source=blog&amp;utm_medium=inline&amp;utm_campaign=x&amp;utm_content=early"'));
});

test("blogFigure emits an accessible SVG: role=img, title, desc, 300-wide viewBox", () => {
  const html = blogFigure({ id: "f1", title: "T", desc: "D", height: 120, inner: "<rect/>", caption: "C" });
  assert.ok(html.includes('viewBox="0 0 300 120"'));
  assert.ok(html.includes('role="img" aria-labelledby="f1-title f1-desc"'));
  assert.ok(html.includes('<title id="f1-title">T</title><desc id="f1-desc">D</desc>'));
  assert.ok(html.includes("<figcaption"));
});

test("evidenceBlock is marked for the QA script, labeled by provenance and states the plan", () => {
  const modeled = evidenceBlock({ kind: "modeled", title: "A projected loss", bodyHtml: "<p>x</p>", plan: "Pro and Scale" });
  assert.ok(modeled.includes(`${EVIDENCE_ATTR}="in-action"`));
  assert.ok(modeled.includes("EliteVault in action"));
  assert.ok(modeled.includes("modeled projection, not a result"));
  assert.ok(modeled.includes("Available on: Pro and Scale"));

  const agg = evidenceBlock({ kind: "aggregate", title: "t", bodyHtml: "", plan: "everyone", sample: "n = 140 stores, 2026-06-02 to 2026-10-22" });
  assert.ok(agg.includes("(n = 140 stores, 2026-06-02 to 2026-10-22)"));
});

test("helpers never inject the word free into markup they own", () => {
  const all = [
    blogCta("s", "end", "Run the audit on your store →"),
    blogFigure({ id: "a", title: "t", desc: "d", height: 10, inner: "", caption: "c" }),
    evidenceBlock({ kind: "audit", title: "t", bodyHtml: "", plan: "Pro" }),
  ].join("\n");
  assert.ok(!/\bfree\b/i.test(all));
});

test("evidenceBlock is wrapped in comment markers so nested figures cannot hide its end", () => {
  const html = evidenceBlock({ kind: "audit", title: "t", bodyHtml: "<figure><svg></svg></figure>", plan: "Pro" });
  assert.ok(html.startsWith(EV_OPEN) && html.endsWith(EV_CLOSE));
});

test("blogCta does not double-escape an already escaped target and keeps the fragment last", () => {
  const html = blogCta("s", "early", "Go →", { target: "/a?x=1&amp;y=2#sec" });
  assert.ok(html.includes("/a?x=1&amp;y=2&amp;utm_source=blog"));
  assert.ok(!html.includes("&amp;amp;"));
  assert.ok(html.includes("utm_content=early#sec"));
});

test("simulatorReplica renders the real numbers it is given and no others", () => {
  const sc = (roas: number, lo: number, hi: number, spend: number, revenue: number) => ({
    totals: { spend, revenue, purchases: 7.23, roas, roas_range: [lo, hi] as [number, number] },
    days_roas: [0.33, 0.48, 0.64, 0.69, 0.69, 0.69, 0.69],
  });
  const html = simulatorReplica({ id: "s1", aovUsd: 35, dailyBudgetUsd: 100, scenarios: { conservative: sc(0.6, 0.48, 0.72, 420, 253.2), balanced: sc(0.64, 0.48, 0.8, 700, 445.45), aggressive: sc(0.65, 0.42, 0.87, 980, 634.96) } });
  assert.ok(html.includes("0.60x (0.48–0.72x)") && html.includes("0.65x (0.42–0.87x)"));
  assert.ok(html.includes("$420") && html.includes("$635"));
  assert.ok(html.includes("average order value $35, $100 a day"));
  assert.ok(html.includes("role=\"img\"") && html.includes("<title id=\"s1-title\">"));
  assert.ok(!/free/i.test(html));
});
