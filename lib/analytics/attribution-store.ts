import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { AttributionStore } from "@/lib/analytics/attribution";

/** Service-role Supabase implementation of the sign-up attribution store. */
export function serviceAttributionStore(): AttributionStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = createSupabaseServiceClient() as any;
  return {
    async getProfile(userId) {
      const { data, error } = await supa.from("profiles").select("created_at, acq_channel").eq("id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async getVisitor(anonId) {
      const { data, error } = await supa
        .from("visitors")
        .select("anon_id, user_id, first_channel, first_referrer_domain, utm_campaign, first_landing_path")
        .eq("anon_id", anonId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async linkVisitor(anonId, userId) {
      const { error } = await supa.from("visitors").update({ user_id: userId }).eq("anon_id", anonId).is("user_id", null);
      if (error) throw new Error(error.message);
    },
    async setProfileAcq(userId, acq) {
      const { error } = await supa.from("profiles").update(acq).eq("id", userId).is("acq_channel", null);
      if (error) throw new Error(error.message);
    },
  };
}
