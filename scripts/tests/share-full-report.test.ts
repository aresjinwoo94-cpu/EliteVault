import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Public full report of ONE audit (migration 0047, analyses.share_full_report): the owner shares a professional
 * audit as-is. These pin that it is opt-in per audit, read-only, and never changes the default public page.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the flag defaults to false and users cannot set it (0039 allowlist is share_slug/shared_at only)", () => {
  const sql = read("supabase/migrations/0047_share_full_report.sql");
  assert.match(sql, /share_full_report boolean not null default false/);
  const protect = read("supabase/migrations/0039_protect_privileged_columns.sql");
  assert.match(protect, /to_jsonb\(new\) - array\['share_slug', ?'shared_at'\]/);
});

test("the loader only serves an opted-in, succeeded, unblocked audit and fails closed", () => {
  const src = code("lib/share/full-report.ts");
  assert.match(src, /\.eq\("share_slug", slug\)/);
  assert.match(src, /\.eq\("share_full_report", true\)/);
  assert.match(src, /\.eq\("status", "succeeded"\)/);
  assert.match(src, /capture_blocked\?\.detected === true\) return null/);
  assert.match(src, /catch \{\s*return null;/);
});

test("the shared viewer is read-only: no publish, no unlock offer, no run quota, no owner-only API", () => {
  const src = code("lib/share/full-report.ts");
  assert.match(src, /canPublish: false/);
  assert.match(src, /unlockOffer: false/);
  assert.match(src, /fixTracks: undefined/);
  assert.match(src, /isScale: true/);
  assert.match(src, /fullReport: true/);
});

test("AnalysisView `shared` behaves like the anonymous view without the account gate; the simulator cannot re-run", () => {
  const view = code("components/analyzer/analysis-view.tsx");
  assert.match(view, /const isAnon = isAnonProp \|\| shared/);
  assert.match(view, /isDone && isAnon && !shared && \(\s*<AnonRegisterGate/);
  assert.equal((view.match(/readOnly=\{shared\}/g) ?? []).length, 2);
  const sim = code("components/analyzer/meta-campaign-simulator.tsx");
  assert.match(sim, /if \(readOnly && \(!sim \|\| sim\.status !== "succeeded"\)\) return null/);
  assert.match(sim, /\{readOnly \? null : exhausted/);
});

test("the public page only switches to the full report through the loader; the default stays diagnosis-only", () => {
  const page = code("app/s/[slug]/page.tsx");
  assert.match(page, /const full = await loadFullReportProps\(slug\)/);
  assert.match(page, /if \(full\) \{/);
  assert.match(page, /robots: shareRobots\(audit\)/, "the full-report page keeps the same noindex policy");
  assert.match(page, /ShareLockedViews/, "the default page still renders the locked views");
});
