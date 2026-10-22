import { test } from "node:test";
import assert from "node:assert/strict";
import { blogCta, blogFigure, evidenceBlock, CTA_CLASS, EVIDENCE_ATTR } from "../../lib/blog/post-helpers";

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
