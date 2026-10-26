import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  MAX_TOKENS_PER_AUDIT,
  generateClaimToken,
  hashClaimToken,
  looksLikeClaimToken,
} from "@/lib/share/claim-core";

/**
 * Server side of the claim flow. Everything uses the service client: the token tables have no RLS policy and the
 * RPCs (migration 0046) are executable by service_role only. Callers decide WHO may call (owner panel → getOwner(),
 * claim route → a signed-in, email-verified user).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const svc = () => createSupabaseServiceClient() as any;

/** Issue a fresh claim token for an audit. Returns the plain token (it exists only in the message) or null. */
export async function issueClaimToken(analysisId: string): Promise<string | null> {
  const db = svc();
  const { data: a } = await db
    .from("analyses")
    .select("id, share_slug, status")
    .eq("id", analysisId)
    .maybeSingle();
  if (!a?.share_slug || a.status !== "succeeded") return null;
  const { count } = await db
    .from("analysis_claim_tokens")
    .select("token_hash", { count: "exact", head: true })
    .eq("analysis_id", analysisId)
    .is("claimed_at", null);
  if ((count ?? 0) >= MAX_TOKENS_PER_AUDIT) return null;
  const token = generateClaimToken();
  const { error } = await db
    .from("analysis_claim_tokens")
    .insert({ token_hash: hashClaimToken(token), analysis_id: analysisId });
  return error ? null : token;
}

/** Is `token` a live (unused) claim token for the audit published at `slug`? Never throws. */
export async function isClaimTokenValid(slug: string, token: unknown): Promise<boolean> {
  if (!looksLikeClaimToken(token)) return false;
  try {
    const db = svc();
    const { data } = await db
      .from("analysis_claim_tokens")
      .select("token_hash, analyses!inner(share_slug, status)")
      .eq("token_hash", hashClaimToken(token))
      .is("claimed_at", null)
      .eq("analyses.share_slug", slug)
      .eq("analyses.status", "succeeded")
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export type ClaimRpcResult = { ok: true; analysisId: string } | { ok: false; message: string };

/** The atomic transfer (RPC claim_shared_audit). */
export async function claimSharedAudit(p: {
  slug: string;
  token: string;
  userId: string;
  domainMatch: boolean;
}): Promise<ClaimRpcResult> {
  try {
    const { data, error } = await svc().rpc("claim_shared_audit", {
      p_slug: p.slug,
      p_token_hash: hashClaimToken(p.token),
      p_user: p.userId,
      p_domain_match: p.domainMatch,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, analysisId: data as string };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function revertClaim(analysisId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await svc().rpc("revert_claim", { p_analysis: analysisId });
    return error ? { ok: false, message: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function repointShare(oldId: string, newId: string): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  try {
    const { data, error } = await svc().rpc("repoint_share", { p_old: oldId, p_new: newId });
    return error ? { ok: false, message: error.message } : { ok: true, slug: data as string };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
