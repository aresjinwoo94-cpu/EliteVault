import type { SharedAuditRow } from "@/lib/analyzer/share-v2";

/**
 * Public audit pages (/s/[slug]) — indexing, freshness and outreach rules, as pure functions so they are tested.
 *
 * INDEXING (brief 2026-10 §2.5). A shared audit is unlisted by default: `noindex`, and out of the sitemap.
 *   • Most /s/ pages are outreach audits of stores that did not ask for one. Indexing a public critique of a
 *     third party's store is delicate (if the owner finds it on Google before the message, the outreach starts
 *     badly) and many thin look-alike pages hurt the site's quality in Google's eyes.
 *   • A page is indexable only when ALL of these hold: the owner flagged it (`share_indexable`, set by the
 *     admin for an audit the store's own owner published or claimed), it carries the full v2 content, and the
 *     capture was not blocked.
 *   • The link keeps working for anyone who has it; only search engines are told to stay away.
 * The same predicate feeds generateMetadata (robots) and app/sitemap.ts, so the two can never disagree.
 */

/** First name shown in "Prepared by <name> for <domain>" above the owner's personal note. */
export const SHARE_NOTE_AUTHOR = "Ariel";

/** An audit older than this shows the "this store may have changed" banner. Stores change monthly, not daily. */
export const STALE_AFTER_DAYS = 45;

const DAY_MS = 86_400_000;

type PolicyRow = Pick<
  SharedAuditRow,
  "ad_readiness_verdict" | "fix_count" | "potential_why" | "capture_blocked" | "created_at" | "share_indexable"
>;

/** True when the audit carries the report-v2 fields (older audits predate them and render thin). */
export function hasFullV2(row: Pick<SharedAuditRow, "ad_readiness_verdict" | "fix_count" | "potential_why">): boolean {
  const v = row.ad_readiness_verdict;
  const verdictOk = v === "ready" || v === "almost" || v === "not_ready";
  const fixesOk = typeof row.fix_count === "number" && row.fix_count > 0;
  const whyOk = Array.isArray(row.potential_why) && row.potential_why.length > 0;
  return verdictOk && fixesOk && whyOk;
}

/** Whether search engines may index this page and whether the sitemap may list it. */
export function isShareIndexable(row: PolicyRow): boolean {
  return row.share_indexable === true && hasFullV2(row) && row.capture_blocked !== true;
}

/** `robots` value for generateMetadata. */
export function shareRobots(row: PolicyRow): { index: boolean; follow: boolean } {
  return isShareIndexable(row) ? { index: true, follow: true } : { index: false, follow: false };
}

/** Whole days since the audit, or null when the date is missing/unparsable. */
export function auditAgeDays(createdAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** Show the stale banner: a pre-v2 audit, or one older than STALE_AFTER_DAYS. */
export function isStaleAudit(row: PolicyRow, now: Date = new Date()): boolean {
  if (!hasFullV2(row)) return true;
  const age = auditAgeDays(row.created_at, now);
  return age != null && age > STALE_AFTER_DAYS;
}

/** "Audited on 24 Oct 2026" (UTC, English: the public page is rendered in English), or null. */
export function auditedOnLabel(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
