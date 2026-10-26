import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { auditAgeDays, hasFullV2, isShareIndexable, isStaleAudit } from "@/lib/analyzer/share-policy";
import type { SharedAuditRow } from "@/lib/analyzer/share-v2";

/** A re-audit started by hand from the owner panel (analyses.reaudit_of = the audit it refreshes). */
export interface OwnerReaudit {
  id: string;
  status: string;
  createdAt: string | null;
  /** Succeeded, with a usable capture: the link can be moved to it. */
  ready: boolean;
}

/** One shared audit as the owner panel needs it (no paid content: only what /s/<slug> already shows). */
export interface OwnerSharedAudit {
  id: string;
  slug: string;
  domain: string;
  auditedAt: string | null;
  ageDays: number | null;
  verdict: string | null;
  fullV2: boolean;
  captureBlocked: boolean;
  stale: boolean;
  note: string | null;
  indexable: boolean;
  /** Would the page really be indexed (flag + complete v2 + unblocked)? */
  indexed: boolean;
  /** The audit belongs to the owner's own account (outreach audits do; claimed ones do not). */
  ownedByOwner: boolean;
  /** Active claim (transferred to someone else): who and when. */
  claim: { email: string | null; at: string; domainMatch: boolean } | null;
  /** Unused claim links issued for this audit. */
  openTokens: number;
  /** Latest manual re-audit of this audit, if any. */
  reaudit: OwnerReaudit | null;
}

export function domainOf(url: string | null): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "store";
  } catch {
    return "store";
  }
}

/** The public-page row (SharedAuditRow) of a raw `analyses` row, built exactly like the RPC would return it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toSharedRow(a: any): SharedAuditRow {
  const r = a.result ?? {};
  return {
    url: a.url ?? null,
    score: typeof r.score === "number" ? r.score : null,
    summary: r.summary ?? null,
    screenshot_url: null,
    category_scores: r.category_scores ?? null,
    annotations: Array.isArray(r.annotations) ? r.annotations : null,
    created_at: a.created_at ?? null,
    ad_readiness_verdict: r.ad_readiness?.verdict ?? null,
    blocker_count: Array.isArray(r.ad_readiness?.blockers) ? r.ad_readiness.blockers.length : 0,
    fix_count: Array.isArray(r.top_fixes) ? r.top_fixes.length : 0,
    potential_why: Array.isArray(r.potential_why) ? r.potential_why : null,
    capture_blocked: typeof r.capture_blocked?.detected === "boolean" ? r.capture_blocked.detected : null,
    share_note: a.share_note ?? null,
    share_indexable: a.share_indexable === true,
  };
}

/** Most recently shared audits first. Fails soft (not ready) if migrations 0045/0046 are not applied yet. */
export async function getOwnerSharedAudits(
  ownerId: string,
  limit = 60,
): Promise<{ rows: OwnerSharedAudit[]; ready: boolean }> {
  try {
    const service = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = service as any;
    const { data, error } = await db
      .from("analyses")
      .select("id, url, user_id, share_slug, share_note, share_indexable, shared_at, created_at, result")
      .not("share_slug", "is", null)
      .eq("status", "succeeded")
      .order("shared_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], ready: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = data as any[];
    const ids = list.map((a) => a.id);

    // claim / re-audit data comes from migration 0046; if it is missing the panel still lists the audits
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let claims: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let tokens: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reaudits: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emails = new Map<string, string>();
    if (ids.length) {
      const c = await db
        .from("analysis_claims")
        .select("analysis_id, to_user_id, claimed_at, email_domain_match")
        .in("analysis_id", ids)
        .is("reverted_at", null);
      if (!c.error) claims = c.data ?? [];
      const t = await db.from("analysis_claim_tokens").select("analysis_id").in("analysis_id", ids).is("claimed_at", null);
      if (!t.error) tokens = t.data ?? [];
      const r = await db
        .from("analyses")
        .select("id, reaudit_of, status, created_at, result")
        .in("reaudit_of", ids)
        .order("created_at", { ascending: false });
      if (!r.error) reaudits = r.data ?? [];
      const userIds = [...new Set(claims.map((x) => x.to_user_id))];
      if (userIds.length) {
        const p = await db.from("profiles").select("id, email").in("id", userIds);
        for (const row of p.data ?? []) emails.set(row.id, row.email);
      }
    }

    const rows: OwnerSharedAudit[] = list.map((a) => {
      const row = toSharedRow(a);
      const claim = claims.find((c) => c.analysis_id === a.id);
      const re = reaudits.find((x) => x.reaudit_of === a.id);
      return {
        id: a.id,
        slug: a.share_slug,
        domain: domainOf(a.url),
        auditedAt: a.created_at ?? null,
        ageDays: auditAgeDays(a.created_at),
        verdict: row.ad_readiness_verdict ?? null,
        fullV2: hasFullV2(row),
        captureBlocked: row.capture_blocked === true,
        stale: isStaleAudit(row),
        note: row.share_note ?? null,
        indexable: row.share_indexable === true,
        indexed: isShareIndexable(row),
        ownedByOwner: a.user_id === ownerId,
        claim: claim
          ? { email: emails.get(claim.to_user_id) ?? null, at: claim.claimed_at, domainMatch: claim.email_domain_match === true }
          : null,
        openTokens: tokens.filter((x) => x.analysis_id === a.id).length,
        reaudit: re
          ? {
              id: re.id,
              status: re.status,
              createdAt: re.created_at ?? null,
              ready: re.status === "succeeded" && !!re.result && re.result?.capture_blocked?.detected !== true,
            }
          : null,
      };
    });
    return { rows, ready: true };
  } catch {
    return { rows: [], ready: false };
  }
}
