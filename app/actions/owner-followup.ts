"use server";

import { getOwner } from "@/lib/admin/guard";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/** Toggles the persisted "Marcar seguimiento" flag of an abandoned checkout. Owner only. */
export async function toggleCheckoutFollowup(
  sessionId: string,
  followed: boolean,
): Promise<{ ok: boolean }> {
  const owner = await getOwner();
  if (!owner || !/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return { ok: false };
  try {
    const supa = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = supa.from("checkout_followups") as any;
    const { error } = followed
      ? await t.upsert({ session_id: sessionId }, { onConflict: "session_id" })
      : await t.delete().eq("session_id", sessionId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
