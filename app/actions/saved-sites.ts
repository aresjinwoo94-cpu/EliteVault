"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe/plans";

/**
 * Toggle a site in/out of the user's saved collection.
 * Pro+ only — Free tier gets a friendly "upgrade" message.
 */
export async function toggleSavedSite(
  siteId: string,
): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (!profile || profile.plan === "free") {
    return {
      ok: false,
      error: "Saving to collections is a Pro feature. Upgrade to organize your inspo.",
    };
  }

  const { data: existing } = await supabase
    .from("saved_sites")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("site_id", siteId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("saved_sites")
      .delete()
      .eq("user_id", user.id)
      .eq("site_id", siteId);
    revalidatePath("/app/library");
    return { ok: true, saved: false };
  }
  const { error } = await supabase
    .from("saved_sites")
    .insert({ user_id: user.id, site_id: siteId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/library");
  return { ok: true, saved: true };
}

export async function getSavedSiteIds(): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data } = await supabase
    .from("saved_sites")
    .select("site_id")
    .eq("user_id", user.id);
  return new Set((data ?? []).map((r) => r.site_id));
}
