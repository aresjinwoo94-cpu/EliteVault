import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { buildOutreachMessage } from "@/lib/analyzer/outreach-message";
import { auditAgeDays, hasFullV2, isShareIndexable, isStaleAudit } from "@/lib/analyzer/share-policy";
import type { SharedAuditRow } from "@/lib/analyzer/share-v2";

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
  /** The ready-to-copy outreach message (no send; the owner pastes it). */
  outreach: string;
}

function domainOf(url: string | null): string {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "store";
  } catch {
    return "store";
  }
}

/** Most recently shared audits first. Fails soft (empty list) if migration 0045 is not applied yet. */
export async function getOwnerSharedAudits(limit = 60): Promise<{ rows: OwnerSharedAudit[]; ready: boolean }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
  try {
    const service = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (service.from("analyses") as any)
      .select(
        "id, url, share_slug, share_note, share_indexable, shared_at, created_at, result",
      )
      .not("share_slug", "is", null)
      .eq("status", "succeeded")
      .order("shared_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], ready: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: OwnerSharedAudit[] = (data as any[]).map((a) => {
      const r = a.result ?? {};
      const fixes = Array.isArray(r.top_fixes) ? r.top_fixes.length : 0;
      const blockers = Array.isArray(r.ad_readiness?.blockers) ? r.ad_readiness.blockers.length : 0;
      const row: SharedAuditRow = {
        url: a.url ?? null,
        score: typeof r.score === "number" ? r.score : null,
        summary: r.summary ?? null,
        screenshot_url: null,
        category_scores: r.category_scores ?? null,
        annotations: Array.isArray(r.annotations) ? r.annotations : null,
        created_at: a.created_at ?? null,
        ad_readiness_verdict: r.ad_readiness?.verdict ?? null,
        blocker_count: blockers,
        fix_count: fixes,
        potential_why: Array.isArray(r.potential_why) ? r.potential_why : null,
        capture_blocked: typeof r.capture_blocked?.detected === "boolean" ? r.capture_blocked.detected : null,
        share_note: a.share_note ?? null,
        share_indexable: a.share_indexable === true,
      };
      const domain = domainOf(a.url);
      return {
        id: a.id,
        slug: a.share_slug,
        domain,
        auditedAt: a.created_at ?? null,
        ageDays: auditAgeDays(a.created_at),
        verdict: row.ad_readiness_verdict ?? null,
        fullV2: hasFullV2(row),
        captureBlocked: row.capture_blocked === true,
        stale: isStaleAudit(row),
        note: row.share_note ?? null,
        indexable: row.share_indexable === true,
        indexed: isShareIndexable(row),
        outreach: buildOutreachMessage({ domain, slug: a.share_slug, row, baseUrl, from: "Ariel" }),
      };
    });
    return { rows, ready: true };
  } catch {
    return { rows: [], ready: false };
  }
}
