import "server-only";
import { stripe } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { UnlockRow, UnlockStore } from "@/lib/unlocks/settle";

/** The production `UnlockStore`: service-role Supabase + Stripe refunds. */
export function createUnlockStore(): UnlockStore {
  const service = createSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = service as any;
  return {
    async getAnalysisOwner(analysisId) {
      const { data } = await db.from("analyses").select("user_id").eq("id", analysisId).maybeSingle();
      return (data as { user_id?: string | null } | null)?.user_id ?? null;
    },
    async getUnlock(analysisId) {
      const { data } = await db
        .from("analysis_unlocks")
        .select("stripe_session_id, status")
        .eq("analysis_id", analysisId)
        .maybeSingle();
      return (data as { stripe_session_id: string; status: string } | null) ?? null;
    },
    async insertUnlock(row: UnlockRow) {
      // on conflict (analysis_id) do nothing → `data` is empty when another row already owns the audit
      const { data, error } = await db
        .from("analysis_unlocks")
        .upsert(row, { onConflict: "analysis_id", ignoreDuplicates: true })
        .select("analysis_id");
      if (error) {
        // the same session settled concurrently (unique stripe_session_id) is a conflict, not a failure
        if (error.code === "23505") return "conflict";
        throw new Error(`insertUnlock: ${error.message}`);
      }
      return Array.isArray(data) && data.length > 0 ? "inserted" : "conflict";
    },
    async refundPaymentIntent(paymentIntentId, key) {
      await stripe.refunds.create({ payment_intent: paymentIntentId, reason: "duplicate" }, { idempotencyKey: key });
    },
  };
}
