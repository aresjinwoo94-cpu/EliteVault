import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STALE_AFTER_DAYS,
  auditAgeDays,
  auditedOnLabel,
  hasFullV2,
  isShareIndexable,
  isStaleAudit,
  shareRobots,
} from "@/lib/analyzer/share-policy";
import { buildShareResult, shareMeta, type SharedAuditRow } from "@/lib/analyzer/share-v2";
import { buildOutreachMessage, outreachLink, visibleFinding } from "@/lib/analyzer/outreach-message";
import { lockedViewItems } from "@/lib/analyzer/share-locked";

/**
 * Public audit page (/s/[slug]) redesign — brief 2026-10 §2. What these pin:
 *   • no score ("/100", the radar, "scored") anywhere on the page, metadata, JSON-LD or OG image;
 *   • no "free" / "no card" in any copy of the page;
 *   • outreach audits and pre-v2 / blocked captures are noindex and out of the sitemap;
 *   • locked views carry names and counts, never paid text;
 *   • the outreach message uses only what the public page shows.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** Source without comments: the rules below are about what the code renders, not what its comments say. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const NOW = new Date("2026-10-25T12:00:00Z");

function row(over: Partial<SharedAuditRow> = {}): SharedAuditRow {
  return {
    url: "https://www.example-store.com/",
    score: 56,
    summary: "A short public summary.",
    screenshot_url: "https://img.example/shot.png",
    category_scores: { cro_principles: 40, layout_proportion: 60 },
    annotations: [{ x: 0.1, y: 0.1, message: "The hero never says what the store sells." }],
    created_at: "2026-10-20T10:00:00Z",
    ad_readiness_verdict: "not_ready",
    blocker_count: 2,
    fix_count: 5,
    potential_why: ["Demand is there, the page loses it."],
    capture_blocked: false,
    share_note: null,
    share_indexable: false,
    ...over,
  };
}

// ── Indexing policy ──────────────────────────────────────────────────────────

test("a shared audit is noindex by default, even with full v2 content", () => {
  const r = row();
  assert.equal(isShareIndexable(r), false);
  assert.deepEqual(shareRobots(r), { index: false, follow: false });
});

test("only an owner-flagged, complete v2, unblocked audit is indexable", () => {
  assert.equal(isShareIndexable(row({ share_indexable: true })), true);
  assert.deepEqual(shareRobots(row({ share_indexable: true })), { index: true, follow: true });
});

test("pre-v2 audits are never indexable, even when flagged", () => {
  const pre = row({ share_indexable: true, ad_readiness_verdict: null, fix_count: null, potential_why: null });
  assert.equal(hasFullV2(pre), false);
  assert.equal(isShareIndexable(pre), false);
  assert.equal(shareRobots(pre).index, false);
});

test("a blocked capture is never indexable, even when flagged", () => {
  assert.equal(isShareIndexable(row({ share_indexable: true, capture_blocked: true })), false);
});

test("an unknown/missing flag fails closed (migration 0045 not applied yet)", () => {
  const r = row();
  delete (r as { share_indexable?: unknown }).share_indexable;
  assert.equal(isShareIndexable(r), false);
});

test("sitemap and the page's robots use the same predicate and only flagged rows", () => {
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /isShareIndexable/);
  assert.match(sitemap, /share_indexable/);
  const page = read("app/s/[slug]/page.tsx");
  assert.match(page, /robots: shareRobots\(audit\)/);
  // not-found pages are kept out of the index too
  assert.match(page, /Audit not found[\s\S]*index: false/);
});

test("the migration defaults share_indexable to false and never exposes paid keys", () => {
  const sql = read("supabase/migrations/0045_share_page_v3.sql");
  assert.match(sql, /share_indexable boolean not null default false/);
  assert.match(sql, /char_length\(share_note\) <= 280/);
  // the JSON keys returned by get_shared_audit: no top_fixes titles, no persona
  assert.doesNotMatch(sql, /^\s*'(top_fixes|buyer_persona_response)',/m);
});

// ── Freshness ────────────────────────────────────────────────────────────────

test("audits are stale after STALE_AFTER_DAYS or when pre-v2", () => {
  assert.equal(isStaleAudit(row({ created_at: "2026-10-20T10:00:00Z" }), NOW), false);
  const old = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 2) * 86_400_000).toISOString();
  assert.equal(isStaleAudit(row({ created_at: old }), NOW), true);
  assert.equal(isStaleAudit(row({ ad_readiness_verdict: null, fix_count: null, potential_why: null }), NOW), true);
});

test("the audit date is rendered as a plain date, and age is whole days", () => {
  assert.equal(auditedOnLabel("2026-10-20T10:00:00Z"), "20 Oct 2026");
  assert.equal(auditedOnLabel(null), null);
  assert.equal(auditAgeDays("2026-10-20T10:00:00Z", NOW), 5);
  assert.equal(auditAgeDays("not a date", NOW), null);
});

// ── No score, no "free" ──────────────────────────────────────────────────────

const PAGE_FILES = [
  "app/s/[slug]/page.tsx",
  "app/s/[slug]/opengraph-image.tsx",
  "components/share/share-blocks.tsx",
  "components/share/share-analytics.tsx",
  "components/share/share-audit-box.tsx",
  "lib/analyzer/share-v2.ts",
  "lib/analyzer/share-locked.ts",
  "lib/analyzer/outreach-message.ts",
];

test("the /s/ page and OG image render no score and no radar", () => {
  for (const f of PAGE_FILES) {
    const src = code(f);
    assert.doesNotMatch(src, /\/\s?100\b/, `${f} must not render "/100"`);
    assert.doesNotMatch(src, /CategoryRadar/, `${f} must not render the radar`);
    assert.doesNotMatch(src, /scored/i, `${f} must not say "scored"`);
    assert.doesNotMatch(src, /tier(World|Strong|Average|Below|Broken)/, `${f} must not use score tiers`);
  }
  const og = code("app/s/[slug]/opengraph-image.tsx");
  assert.doesNotMatch(og, /analyzerReportV2Enabled/, "the OG image no longer branches on the report flag");
  assert.doesNotMatch(og, /rawScore|score\s*\?\?/, "the OG image never reads the score");
});

test("the page no longer branches on ANALYZER_REPORT_V2 (it never showed a score in either mode)", () => {
  assert.doesNotMatch(code("app/s/[slug]/page.tsx"), /analyzerReportV2Enabled/);
});

test("metadata, JSON-LD headline and OG text carry no score", () => {
  const { title, description } = shareMeta("example-store.com", buildShareResult(row()));
  for (const s of [title, description]) {
    assert.doesNotMatch(s, /\d\s*\/\s*100|\bscored?\b/i);
    assert.doesNotMatch(s, /\bfree\b|no card/i);
  }
  assert.match(title, /example-store\.com — Not ready for cold paid traffic/);
});

function sharedPageStrings(file: string): string[] {
  const dict = JSON.parse(read(file)) as { sharedPage: Record<string, string> };
  return Object.values(dict.sharedPage);
}

test('no "free" / "no card" (nor "gratis" / "sin tarjeta") in the page copy', () => {
  for (const s of sharedPageStrings("lib/i18n/dict/ui-en.json")) assert.doesNotMatch(s, /\bfree\b|no card|credit card/i, s);
  for (const s of sharedPageStrings("lib/i18n/dict/ui-es.json")) assert.doesNotMatch(s, /\bfree\b|gratis|sin tarjeta/i, s);
  // CTAs written in code, not just the dictionary
  for (const f of ["app/s/[slug]/page.tsx", "components/share/share-blocks.tsx", "app/s/[slug]/opengraph-image.tsx"]) {
    assert.doesNotMatch(code(f), /auditFree|Audit your store free/, f);
  }
});

test("the English and Spanish sharedPage dictionaries have the same keys", () => {
  const en = Object.keys(JSON.parse(read("lib/i18n/dict/ui-en.json")).sharedPage).sort();
  const es = Object.keys(JSON.parse(read("lib/i18n/dict/ui-es.json")).sharedPage).sort();
  assert.deepEqual(en, es);
});

// ── Locked views never contain paid text ─────────────────────────────────────

test("locked views are names and counts: they take no audit content, so none can leak", () => {
  const en = JSON.parse(read("lib/i18n/dict/ui-en.json")) as Record<string, Record<string, string>>;
  const t = (k: string) => en.sharedPage[k.replace("sharedPage.", "")] ?? k;
  const items = lockedViewItems(t, 3);
  assert.deepEqual(
    items.map((i) => i.position),
    ["locked_fixes", "locked_persona", "locked_scenarios", "locked_library"],
  );
  assert.equal(items[0].title, "3 fixes ranked by impact");
  assert.equal(lockedViewItems(t, 1)[0].title, "1 fix ranked by impact");
  assert.equal(lockedViewItems(t, 0).some((i) => i.position === "locked_fixes"), false);
  // plan statements match the code: Scenarios = Pro/Scale (+ $7 = one projection); fixes/persona = $7 or Pro
  const byPos = Object.fromEntries(items.map((i) => [i.position, i.plan]));
  assert.match(byPos.locked_scenarios, /Pro/);
  assert.match(byPos.locked_scenarios, /Scale/);
  assert.match(byPos.locked_fixes, /\$7/);
  assert.match(byPos.locked_persona, /\$7/);
});

test("the locked blocks and the public RPC row never touch top_fixes or the persona", () => {
  for (const f of ["components/share/share-blocks.tsx", "lib/analyzer/share-locked.ts"]) {
    const src = code(f);
    assert.doesNotMatch(src, /top_fixes|buyer_persona|\.fixes\b|persona_response/, f);
  }
  const page = read("app/s/[slug]/page.tsx");
  assert.match(page, /ShareLockedViews t=\{t\} slug=\{slug\} fixCount=\{fixCount\}/, "the page passes only a count");
  // the share result keeps its placeholder fixes (titles are "item N"), never real ones
  const built = buildShareResult(row({ fix_count: 3 }));
  assert.deepEqual(
    (built.top_fixes as { title: string }[]).map((f) => f.title),
    ["item 1", "item 2", "item 3"],
  );
});

// ── Embedded audit box = the existing anonymous flow ─────────────────────────

test("the URL box is the existing anonymous flow, with the share event and attribution", () => {
  const box = read("components/share/share-audit-box.tsx");
  assert.match(box, /AnonAuditBox/);
  assert.match(box, /source="share_page"/);
  assert.match(box, /share_urlbox_submit|SHARE_EVENTS\.urlboxSubmit/);
  const anon = read("components/marketing/anon-audit-box.tsx");
  assert.match(anon, /createAnonAnalysis/, "quota and anti-bot stay server-side in createAnonAnalysis");
  assert.match(anon, /onSubmitUrl\?\.\(value\)/);
});

test("the page fires share_view and the CTAs fire share_cta_click", () => {
  const page = read("app/s/[slug]/page.tsx");
  assert.match(page, /ShareViewTracker slug=\{slug\} mode={ownerMode/);
  const analytics = read("components/share/share-analytics.tsx");
  assert.match(analytics, /SHARE_EVENTS\.view/);
  assert.match(analytics, /SHARE_EVENTS\.ctaClick/);
  const events = read("lib/analytics/share-events.ts");
  for (const e of ["share_view", "share_cta_click", "share_urlbox_submit", "share_claim_start", "share_claim_done"]) {
    assert.match(events, new RegExp(`"${e}"`));
  }
});

// ── Outreach message ─────────────────────────────────────────────────────────

test("the outreach link carries the share UTMs", () => {
  const link = outreachLink("https://elitevaultapp.com/", "acme-abc123");
  const u = new URL(link);
  assert.equal(u.pathname, "/s/acme-abc123");
  assert.equal(u.searchParams.get("utm_source"), "share");
  assert.equal(u.searchParams.get("utm_medium"), "outreach");
  assert.equal(u.searchParams.get("utm_campaign"), "acme-abc123");
});

test("the outreach message has the domain, the verdict in words, one visible finding and the link, and nothing paid", () => {
  const msg = buildOutreachMessage({
    domain: "example-store.com",
    slug: "example-store-com-4fovey",
    row: row(),
    baseUrl: "https://elitevaultapp.com",
    from: "Ariel",
  });
  assert.match(msg, /example-store\.com/);
  assert.match(msg, /not ready for cold paid traffic/);
  assert.match(msg, /The hero never says what the store sells\./);
  assert.match(msg, /utm_source=share&utm_medium=outreach&utm_campaign=example-store-com-4fovey/);
  assert.match(msg, /not listed it for search/);
  assert.doesNotMatch(msg, /\bfree\b|no card|\/\s?100|\bscore/i);
  assert.doesNotMatch(msg, /item \d/, "placeholder fix titles never reach the message");
});

test("an indexable page is not described as unlisted; a missing finding is simply left out", () => {
  const msg = buildOutreachMessage({
    domain: "example-store.com",
    slug: "s",
    row: row({ share_indexable: true, annotations: [] }),
    baseUrl: "https://elitevaultapp.com",
  });
  assert.doesNotMatch(msg, /not listed it/);
  assert.doesNotMatch(msg, /stood out/);
  assert.equal(visibleFinding(null), null);
  assert.equal(visibleFinding([{ message: "short" }]), null);
});

test("owner controls are owner-only and server-written", () => {
  const action = read("app/actions/share-admin.ts");
  assert.match(action, /getOwner\(\)/);
  assert.match(action, /createSupabaseServiceClient/);
  assert.match(action, /max\(280\)/);
  const panel = read("app/(app)/app/owner/page.tsx");
  assert.match(panel, /OwnerSharedAudits/);
  assert.match(read("components/admin/owner-shared-audits.tsx"), /Copy outreach message/);
});

// ── The paid "how" of each annotation never reaches the public page ──────────

test("annotation fix text is stripped in the page and in the RPC", () => {
  const page = code("app/s/[slug]/page.tsx");
  assert.match(page, /annotations: stripPaidFix\(d\.annotations\)/);
  assert.match(page, /fix: "", fix_locked: true/);
  const sql = read("supabase/migrations/0045_share_page_v3.sql");
  assert.match(sql, /e - 'fix'/);
  assert.match(sql, /'fix_locked', true/);
});

test("the $7 sentences only appear when the unlock is on", () => {
  const en = JSON.parse(read("lib/i18n/dict/ui-en.json")) as Record<string, Record<string, string>>;
  const t = (k: string) => en.sharedPage[k.replace("sharedPage.", "")] ?? k;
  const off = lockedViewItems(t, 3, false).map((i) => i.plan).join(" ");
  assert.doesNotMatch(off, /\$7/);
  const on = lockedViewItems(t, 3, true).map((i) => i.plan).join(" ");
  assert.match(on, /\$7/);
  assert.match(code("app/s/[slug]/page.tsx"), /unlockOn=\{unlockOn\}/);
  const es = JSON.parse(read("lib/i18n/dict/ui-es.json")).sharedPage;
  assert.deepEqual(Object.keys(en.sharedPage).sort(), Object.keys(es).sort());
});

test("JSON-LD output is escaped against </script> breakouts", () => {
  assert.match(code("app/s/[slug]/page.tsx"), /replace\(\/<\/g, "\\u003c"\)/);
});
