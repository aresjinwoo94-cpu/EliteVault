import { shareVerdictPhrase, buildShareResult, type SharedAuditRow } from "@/lib/analyzer/share-v2";
import { isShareIndexable } from "@/lib/analyzer/share-policy";

/**
 * "Copy outreach message" (brief 2026-10 §2.6): a short, honest message the owner pastes into an email/DM.
 * Built ONLY from what the public page already shows — the domain, the verdict in words and one annotated
 * finding (the annotation text is visible on /s/<slug>). Nothing paid (fix titles, persona, projections) is used,
 * and nothing is sent: the owner copies it. The link carries UTMs so PostHog can attribute the visit.
 */

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** `https://host/s/<slug>?utm_source=share&utm_medium=outreach&utm_campaign=<slug>` */
export function outreachLink(baseUrl: string, slug: string, claimToken?: string | null): string {
  const q = new URLSearchParams({ utm_source: "share", utm_medium: "outreach", utm_campaign: slug });
  // single-use claim token (lib/share/claim.ts): opens the "Is this your store?" block for whoever receives the link
  if (claimToken) q.set("c", claimToken);
  return `${baseUrl.replace(/\/$/, "")}/s/${encodeURIComponent(slug)}?${q.toString()}`;
}

/** First annotation whose text is short enough to quote, or null. */
export function visibleFinding(annotations: SharedAuditRow["annotations"]): string | null {
  if (!Array.isArray(annotations)) return null;
  for (const a of annotations) {
    const m = (a as { message?: unknown })?.message;
    if (typeof m === "string" && clean(m).length >= 12) {
      const t = clean(m);
      return t.length > 160 ? `${t.slice(0, 157).trimEnd()}…` : t;
    }
  }
  return null;
}

export function buildOutreachMessage(args: {
  domain: string;
  slug: string;
  row: SharedAuditRow;
  baseUrl: string;
  /** First name or brand to sign with; omitted → no signature line. */
  from?: string | null;
  /** Claim token to put in the link; omitted → a plain visitor link. */
  claimToken?: string | null;
}): string {
  const { domain, slug, row, baseUrl, from, claimToken } = args;
  const verdict = shareVerdictPhrase(buildShareResult(row)).toLowerCase();
  const finding = visibleFinding(row.annotations);
  const unlisted = !isShareIndexable({
    ad_readiness_verdict: row.ad_readiness_verdict,
    fix_count: row.fix_count,
    potential_why: row.potential_why,
    capture_blocked: row.capture_blocked,
    created_at: row.created_at,
    share_indexable: row.share_indexable,
  });
  const lines = [
    `Hi, I ran a conversion audit on ${domain} and wanted to share it with you.`,
    `The short version: ${verdict}.`,
    finding ? `One thing that stood out: ${finding}` : null,
    `The annotated audit is here: ${outreachLink(baseUrl, slug, claimToken)}`,
    unlisted ? "I have not listed it for search; only people with the link can see it." : null,
    "Happy to talk it through if it is useful.",
    from ? from : null,
  ];
  return lines.filter((l): l is string => !!l).join("\n\n");
}
