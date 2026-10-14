/**
 * Stable, low-cardinality `reason` for the `audit_failed` funnel event (brief oct-2026 §7.1 / §R P1).
 *
 * `analyses.error` holds the user-facing sentence written by humanizeError (inngest/functions/analyze-website.ts)
 * or by the stale-run pollers. This maps those sentences to a short code so PostHog can break failures down
 * without storing free text. Pure and import-free: the mapping is pinned by a test.
 */
export type AuditFailureReason =
  | "time_limit"
  | "step_timeout"
  | "worker_timeout"
  | "capture_blocked"
  | "capture_failed"
  | "provider_overloaded"
  | "provider_rate_limited"
  | "empty_response"
  | "schema_invalid"
  | "unknown";

export function auditFailureReason(error: string | null | undefined): AuditFailureReason {
  const e = String(error ?? "");
  if (!e.trim()) return "unknown";
  if (/passed our time limit/i.test(e)) return "time_limit";
  if (/longer to audit than one run allows/i.test(e)) return "step_timeout";
  if (/worker likely crashed|timed out mid-run|audit timed out|took too long and was stopped/i.test(e)) return "worker_timeout";
  if (/block automated|anti-bot|Cloudflare/i.test(e)) return "capture_blocked";
  if (/couldn't capture|capture a screenshot/i.test(e)) return "capture_failed";
  if (/overloaded|high demand/i.test(e)) return "provider_overloaded";
  if (/rate-limited|quota/i.test(e)) return "provider_rate_limited";
  if (/couldn't read this page/i.test(e)) return "empty_response";
  if (/malformed output/i.test(e)) return "schema_invalid";
  return "unknown";
}
