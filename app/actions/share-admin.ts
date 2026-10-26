"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOwner } from "@/lib/admin/guard";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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

/** `error` is a machine code (forbidden | note_too_long | not_shared) or a database message; the owner panel maps it. */
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
