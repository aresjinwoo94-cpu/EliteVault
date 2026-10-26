"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOwner } from "@/lib/admin/guard";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { createAnalysis } from "@/app/actions/analyzer";
import { issueClaimToken, repointShare, revertClaim } from "@/lib/share/claim";
import { buildOutreachMessage } from "@/lib/analyzer/outreach-message";
import { domainOf, toSharedRow } from "@/lib/admin/shared-audits";

/**
 * Owner-only controls for a shared audit (/s/<slug>) — brief 2026-10 §2.2 (personal note) and §2.5 (indexing).
 *
 *   share_note       short personal note shown at the top of the public page. Max 280 chars (DB check too).
 *   share_indexable  default false. Turn it on ONLY for an audit the store's own owner published or claimed;
 *                    the page still needs complete v2 content and an unblocked capture to be indexed
 *                    (lib/analyzer/share-policy.ts). Everything else stays noindex and out of the sitemap.
 *
 * Both columns are server-written: migration 0039's analyses trigger lets signed-in users update only
 * share_slug / shared_at, so these cannot be set through the public anon key.
 */

const Input = z.object({
  analysisId: z.string().uuid(),
  note: z.string().max(280).nullable(),
  indexable: z.boolean(),
});

/** `error` is a machine code (forbidden | note_too_long | not_shared | claimed | too_soon | has_paid_unlock | …) or a database message; the owner panel maps it. */
export type ShareAdminResult = { ok: true } | { ok: false; error: string };

export async function setShareSettings(input: {
  analysisId: string;
  note: string | null;
  indexable: boolean;
}): Promise<ShareAdminResult> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const parsed = Input.safeParse({
    ...input,
    note: input.note?.trim() ? input.note.trim() : null,
  });
  if (!parsed.success) return { ok: false, error: "note_too_long" };

  try {
    const supa = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = supa.from("analyses") as any;
    const { data, error } = await t
      .update({ share_note: parsed.data.note, share_indexable: parsed.data.indexable })
      .eq("id", parsed.data.analysisId)
      .not("share_slug", "is", null)
      .select("share_slug")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "not_shared" };
    revalidatePath(`/s/${data.share_slug}`);
    revalidatePath("/app/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Outreach message, claim revert, manual re-audit (docs/design-share-claim-unlock-reaudit.md) ─────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createSupabaseServiceClient() as any;

async function hasActiveClaim(analysisId: string): Promise<boolean> {
  const { data } = await db()
    .from("analysis_claims")
    .select("id")
    .eq("analysis_id", analysisId)
    .is("reverted_at", null)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

/**
 * "Copy outreach message": builds the message from what the public page shows and, for an unclaimed audit,
 * issues a fresh single-use claim token so the link opens the "Is this your store?" block. Nothing is sent.
 */
export async function copyOutreachMessage(
  analysisId: string,
): Promise<{ ok: true; message: string; withClaimLink: boolean } | { ok: false; error: string }> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  if (!z.string().uuid().safeParse(analysisId).success) return { ok: false, error: "not_shared" };
  try {
    const { data: a, error } = await db()
      .from("analyses")
      .select("id, url, share_slug, share_note, share_indexable, created_at, result")
      .eq("id", analysisId)
      .not("share_slug", "is", null)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!a) return { ok: false, error: "not_shared" };
    const claimed = await hasActiveClaim(analysisId);
    const token = claimed ? null : await issueClaimToken(analysisId);
    const message = buildOutreachMessage({
      domain: domainOf(a.url),
      slug: a.share_slug,
      row: toSharedRow(a),
      baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com",
      from: "Ariel",
      claimToken: token,
    });
    return { ok: true, message, withClaimLink: !!token };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Give a claimed audit back to the owner's account (refused if a $7 unlock was paid on it). */
export async function revertShareClaim(analysisId: string): Promise<ShareAdminResult> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  if (!z.string().uuid().safeParse(analysisId).success) return { ok: false, error: "not_shared" };
  const res = await revertClaim(analysisId);
  if (!res.ok) return { ok: false, error: res.message.includes("has_paid_unlock") ? "has_paid_unlock" : res.message.includes("no_claim") ? "no_claim" : res.message };
  revalidatePath("/app/owner");
  return { ok: true };
}

const DAY_MS = 86_400_000;

/**
 * Manual re-audit, step 1 (never batch, never scheduled): run a fresh audit of the same URL from the OWNER's
 * account (his quota, the normal pipeline). Refused for claimed audits (they belong to the claimant), for audits
 * the owner account does not own, and within 24 h of the previous re-audit of the same audit.
 */
export async function startShareReaudit(
  analysisId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  if (!z.string().uuid().safeParse(analysisId).success) return { ok: false, error: "not_shared" };
  try {
    const { data: a } = await db()
      .from("analyses")
      .select("id, url, user_id, share_slug")
      .eq("id", analysisId)
      .maybeSingle();
    if (!a?.share_slug || !a.url) return { ok: false, error: "not_shared" };
    if (a.user_id !== owner.id || (await hasActiveClaim(analysisId))) return { ok: false, error: "claimed" };

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { data: recent } = await db()
      .from("analyses")
      .select("id")
      .eq("reaudit_of", analysisId)
      .gte("created_at", since)
      .limit(1);
    if (Array.isArray(recent) && recent.length > 0) return { ok: false, error: "too_soon" };

    const created = await createAnalysis({ url: a.url, force: true });
    if (!created.ok) return { ok: false, error: created.error };
    const { error } = await db().from("analyses").update({ reaudit_of: analysisId }).eq("id", created.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/app/owner");
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Manual re-audit, step 2: move the public link (slug, note, indexing flag, unused claim links) to the fresh audit. */
export async function replaceShareWithReaudit(oldId: string, newId: string): Promise<ShareAdminResult> {
  const owner = await getOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const ids = z.object({ a: z.string().uuid(), b: z.string().uuid() }).safeParse({ a: oldId, b: newId });
  if (!ids.success) return { ok: false, error: "not_shared" };
  const res = await repointShare(oldId, newId);
  if (!res.ok) return { ok: false, error: res.message };
  revalidatePath(`/s/${res.slug}`);
  revalidatePath("/app/owner");
  return { ok: true };
}
