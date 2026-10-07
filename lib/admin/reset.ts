import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  CODE_RESET_DEFAULT_ISO,
  applyReset,
  resolveResetAt,
  type ResetResult,
} from "@/lib/admin/reset-core";

const KEY = "metrics_reset_at";

let cached: { at: number; ms: number } | null = null;
const CACHE_MS = 5000; // one panel load calls getResetAt ~20 times

/** Current reset point (epoch ms): DB → code default → env. Never throws. */
export async function getResetAt(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ms;
  let db: string | null = null;
  try {
    const supa = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supa.from("owner_settings") as any)
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    db = (data?.value as string | undefined) ?? null;
  } catch {
    /* table missing / transient error → code default */
  }
  const ms = resolveResetAt({ db, env: process.env.OWNER_METRICS_RESET_AT });
  cached = { at: Date.now(), ms };
  return ms;
}

export async function getResetAtIso(): Promise<string> {
  const ms = await getResetAt();
  return new Date(ms || Date.parse(CODE_RESET_DEFAULT_ISO)).toISOString();
}

/** Writes now() as the reset point; optionally deletes older traffic rows. */
export async function runOwnerReset(opts: { purgeTraffic: boolean }): Promise<ResetResult> {
  const supa = createSupabaseServiceClient();
  return applyReset(
    {
      now: () => Date.now(),
      saveResetAt: async (iso) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supa.from("owner_settings") as any).upsert(
          { key: KEY, value: iso, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
        if (error) throw new Error(error.message);
        cached = null; // the next read must see the new reset point
      },
      purgeTraffic: async (iso) => {
        const [pv, ss, vs] = await Promise.all([
          supa.from("page_views").delete().lt("created_at", iso),
          // Never delete a session that is live right now (its next beat would
          // re-create it as a "first beat" with the wrong landing page).
          supa.from("sessions").delete().lt("started_at", iso).lt("last_seen_at", new Date(Date.now() - 120000).toISOString()),
          // Keep visitors already linked to an account (attribution history).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supa.from("visitors") as any).delete().lt("first_seen_at", iso).is("user_id", null),
        ]);
        const err = pv.error || ss.error || vs.error;
        if (err) throw new Error(err.message);
      },
    },
    opts,
  );
}
