import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildShareResult,
  shareMeta,
  shareVerdictPhrase,
  sharePotentialWhy,
  type SharedAuditRow,
} from "../../lib/analyzer/share-v2";
import { potentialBandForResult, adReadinessWords } from "../../lib/analyzer/report-v2";

/**
 * Shared-audit v2 (brief §4): the public /s/[slug] page shows the SAME hero as
 * the report — verdict in words + revenue-potential band + "why" — and NEVER a
 * score. These lock the reconstruction + metadata, the old-audit fallbacks, the
 * capture-blocked guard, and that the RPC never exposes the paid fixes.
 */

const cats = {
  color_integration: 60,
  layout_proportion: 55,
  image_quality: 64,
  technical_optimization: 50,
  niche_coherence: 58,
  cro_principles: 45,
};

function row(over: Partial<SharedAuditRow> = {}): SharedAuditRow {
  return {
    url: "https://acme-store.com",
    score: 58,
    summary: "A clean store that hides its offer.",
    screenshot_url: "https://cdn/shot.png",
    category_scores: cats,
    annotations: [],
    created_at: "2026-09-20T00:00:00Z",
    ad_readiness_verdict: "not_ready",
    blocker_count: 3,
    fix_count: 5,
    potential_why: ["Real niche demand.", "The hero hides the offer."],
    capture_blocked: false,
    ...over,
  };
}

test("buildShareResult reconstructs verdict + counts the report-v2 helpers read", () => {
  const r = buildShareResult(row());
  const words = adReadinessWords(r);
  assert.equal(words?.verdict, "not_ready");
  assert.equal(words?.blockerCount, 3, "uses blocker_count");
  // the band is derived (never invented) and non-null for a scored store
  assert.ok(potentialBandForResult(r));
});

test("shareMeta shows the verdict + band and NEVER a score or /100", () => {
  const { title, description } = shareMeta("acme-store.com", buildShareResult(row()));
  assert.match(title, /Not ready for cold paid traffic/);
  assert.match(title, /revenue potential/i);
  assert.doesNotMatch(title, /scored/i);
  assert.doesNotMatch(title, /\/\s*100/);
  assert.doesNotMatch(title, /\b\d{1,3}\s*\/\s*100\b/);
  assert.doesNotMatch(description, /scored|\/100/i);
});

test("the AI potential_why lines are used when present and capture is clear", () => {
  assert.deepEqual(sharePotentialWhy(buildShareResult(row())), [
    "Real niche demand.",
    "The hero hides the offer.",
  ]);
});

test("a blocked capture hides the AI lines (fall back to generic bullets)", () => {
  const r = buildShareResult(row({ capture_blocked: true }));
  assert.equal(sharePotentialWhy(r), null);
});

test("an OLD shared audit (no verdict / potential_why) degrades gracefully", () => {
  const old = buildShareResult(
    row({
      ad_readiness_verdict: null,
      blocker_count: null,
      fix_count: null,
      potential_why: null,
      capture_blocked: null,
    }),
  );
  // Generic verdict phrase, no AI lines — and still no score in the meta.
  assert.equal(shareVerdictPhrase(old), "Here's what's costing you sales");
  assert.equal(sharePotentialWhy(old), null);
  const { title } = shareMeta("acme-store.com", old);
  assert.doesNotMatch(title, /scored|\/100/i);
});

test("the 0033 RPC never exposes the paid fixes or the persona", () => {
  const raw = readFileSync(
    resolve(import.meta.dirname, "../../supabase/migrations/0033_shared_audit_v2.sql"),
    "utf8",
  );
  // Strip -- comments so we assert on the executed SQL, not the doc header.
  // `--` to end-of-line, CRLF-safe ([^\n] eats a trailing \r that a line-split
  // + `$` regex would leave behind, so a comment can't survive as CRLF).
  const sql = raw.replace(/--[^\n]*/g, "");
  // top_fixes may be referenced for a COUNT, but never returned as a key.
  assert.equal(sql.includes("'top_fixes',"), false, "top_fixes must not be an output key");
  assert.equal(/'top_fixes'\s*,\s*a\.result->'top_fixes'/.test(sql), false);
  // The persona is never referenced in the executed SQL.
  assert.equal(/buyer_persona/i.test(sql), false, "persona must not be exposed");
  // And the fix count IS derived from the array length (not its contents).
  assert.match(sql, /jsonb_array_length\(a\.result->'top_fixes'\)/);
});
