"use client";

import { phCapture } from "@/lib/analytics/posthog";
import { auditFailureReason } from "@/lib/analyzer/failure-reason";

/**
 * The audit funnel events of brief oct-2026 §7.1 (§R P1): `audit_started`, `audit_completed`,
 * `audit_failed { reason }`, always with `analysis_id` and `anonymous` (no-session visitor vs signed-in).
 *
 * Fired from the browser where the status is OBSERVED (same as the rest of the PostHog funnel, so events
 * share the visitor's person). Terminal events are de-duplicated per audit in sessionStorage — pollers,
 * router refreshes and remounts must never double count. A visitor who closes the tab before the audit
 * ends is not counted as completed/failed; the DB (`analyses`) remains the source of truth for those.
 */
function once(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    /* private mode: better to risk a duplicate than to lose the event */
  }
  return true;
}

export function trackAuditStarted(p: { analysisId: string; anonymous: boolean }) {
  if (!once(`ev_audit_started_${p.analysisId}`)) return;
  phCapture("audit_started", { analysis_id: p.analysisId, anonymous: p.anonymous });
}

export function trackAuditTerminal(p: {
  analysisId: string;
  status: string;
  error?: string | null;
  anonymous: boolean;
}) {
  if (p.status === "succeeded") {
    if (!once(`ev_audit_terminal_${p.analysisId}`)) return;
    phCapture("audit_completed", { analysis_id: p.analysisId, anonymous: p.anonymous });
  } else if (p.status === "failed" || p.status === "refunded") {
    if (!once(`ev_audit_terminal_${p.analysisId}`)) return;
    phCapture("audit_failed", {
      analysis_id: p.analysisId,
      anonymous: p.anonymous,
      reason: auditFailureReason(p.error),
    });
  }
}
