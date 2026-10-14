import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditFailureReason } from "../../lib/analyzer/failure-reason";

/** §R P1 — audit_started / audit_completed / audit_failed { reason } (brief oct-2026 §7.1). */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

test("every message the pipeline writes maps to a stable reason code", () => {
  const cases: [string, string][] = [
    ["We stopped this audit because it passed our time limit — you haven't been charged for it.", "time_limit"],
    ["This store took longer to audit than one run allows — usually a very tall page", "step_timeout"],
    ["Analysis timed out — the worker likely crashed or restarted. Your credit was refunded.", "worker_timeout"],
    ["The audit timed out mid-run. Try again — your credit was refunded.", "worker_timeout"],
    ["We couldn't capture this site (it likely blocks automated screenshots, e.g. Cloudflare or anti-bot).", "capture_blocked"],
    ["This site appears to block automated capture (Cloudflare or similar).", "capture_blocked"],
    ["We couldn't capture a screenshot of that URL.", "capture_failed"],
    ["The AI provider is overloaded right now — this is temporary and on their side.", "provider_overloaded"],
    ["Claude is overloaded right now. Try again in a few minutes", "provider_overloaded"],
    ["AI provider rate-limited this request.", "provider_rate_limited"],
    ["We couldn't read this page on the first pass", "empty_response"],
    ["The AI returned malformed output. This is on us", "schema_invalid"],
    ["something nobody anticipated", "unknown"],
  ];
  for (const [msg, reason] of cases) assert.equal(auditFailureReason(msg), reason, msg);
  assert.equal(auditFailureReason(null), "unknown");
  assert.equal(auditFailureReason(""), "unknown");
});

test("the stale-run poller messages (what refunded audits carry) are classified too", () => {
  for (const f of ["lib/i18n/dict/ui-en.json"]) {
    const dict = JSON.parse(read(f)) as { actionErr: Record<string, string> };
    assert.notEqual(auditFailureReason(dict.actionErr.analysisTimedOut), "unknown", "owned poller message");
    assert.notEqual(auditFailureReason(dict.actionErr.anonTimedOut), "unknown", "anonymous poller message");
  }
});

test("events are wired where the status is observed, with the funnel names of the brief", () => {
  const lib = read("lib/analytics/audit-events.ts");
  for (const ev of ["audit_started", "audit_completed", "audit_failed"]) assert.match(lib, new RegExp(`"${ev}"`));
  assert.match(lib, /analysis_id/);
  assert.match(lib, /anonymous/);
  assert.match(lib, /reason: auditFailureReason/);
  assert.match(lib, /sessionStorage/, "terminal events are de-duplicated");
  assert.match(read("components/analyzer/analyzer-launcher.tsx"), /trackAuditStarted\(\{ analysisId: res\.id, anonymous: false \}\)/);
  assert.match(read("components/analyzer/analyzer-launcher.tsx"), /!res\.reused/);
  assert.match(read("components/marketing/anon-audit-box.tsx"), /trackAuditStarted\(\{ analysisId: res\.id, anonymous: true \}\)/);
  assert.match(read("components/analyzer/anon-pending.tsx"), /trackAuditTerminal\(\{[^}]*anonymous: true/);
  assert.match(read("components/analyzer/analysis-view.tsx"), /trackAuditTerminal\(\{[^}]*anonymous: false/);
});
