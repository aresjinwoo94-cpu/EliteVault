import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { claimSharedAudit, isClaimTokenValid } from "@/lib/share/claim";
import { claimFailureFromRpc, emailMatchesStore, looksLikeClaimToken } from "@/lib/share/claim-core";

/**
 * GET /s/<slug>/claim?c=<token> — the store owner claims the public audit (docs/design-share-claim-unlock-reaudit.md).
 *
 *   • needs a session: otherwise → /sign-up with `next` back to this URL (the token travels in `next`);
 *   • needs a verified email (same rule as the free audit);
 *   • the transfer is ONE transaction in the claim_shared_audit RPC (single-use token, 3 claims a day per user);
 *   • success → /s/<slug>/claimed?a=<id> (fires share_claim_done, then opens the report, where the $7 unlock
 *     of THIS audit is offered by the existing flow); failure → back to the public page with ?claim=<reason>.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const token = req.nextUrl.searchParams.get("c");
  const origin = req.nextUrl.origin;
  const back = (claim?: string) => {
    const u = new URL(`/s/${encodeURIComponent(slug)}`, origin);
    if (token && looksLikeClaimToken(token) && claim !== "used") u.searchParams.set("c", token);
    if (claim) u.searchParams.set("claim", claim);
    return NextResponse.redirect(u);
  };

  if (!looksLikeClaimToken(token) || !(await isClaimTokenValid(slug, token))) return back("used");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = `/s/${encodeURIComponent(slug)}/claim?c=${token}`;
    return NextResponse.redirect(new URL(`/sign-up?next=${encodeURIComponent(next)}`, origin));
  }
  const verified = Boolean(
    (user as { email_confirmed_at?: string | null }).email_confirmed_at ??
      (user as { confirmed_at?: string | null }).confirmed_at,
  );
  if (!verified) return back("verify");

  // domain signal for the owner (not a proof): is the claimant's verified email on the store's domain?
  let storeUrl: string | null = null;
  try {
    const { data } = await createSupabaseServiceClient()
      .from("analyses")
      .select("url")
      .eq("share_slug", slug)
      .maybeSingle();
    storeUrl = (data as { url?: string | null } | null)?.url ?? null;
  } catch {
    /* the signal is optional */
  }

  const res = await claimSharedAudit({
    slug,
    token,
    userId: user.id,
    domainMatch: emailMatchesStore(user.email, storeUrl),
  });
  if (!res.ok) return back(claimFailureFromRpc(res.message));

  return NextResponse.redirect(new URL(`/s/${encodeURIComponent(slug)}/claimed?a=${res.analysisId}`, origin));
}
