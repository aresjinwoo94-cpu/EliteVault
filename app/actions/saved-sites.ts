"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WinningSiteCard } from "@/app/actions/search";

export type PlaybookStatus = "to_apply" | "applied";

export interface PlaybookItem {
  site: WinningSiteCard;
  status: PlaybookStatus;
}

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

/**
 * The Playbook (FASE B). Reads the user's saved stores WITH full store data
 * AND their per-item status, ordered newest-first.
 *
 * Why this exists instead of the old client-side filter: the "Saved" tab used
 * to be `items.filter(savedIds.has)` over the current search result — so a
 * saved store that wasn't among the loaded results simply never appeared. The
 * Playbook must be reliable, so it reads saved rows explicitly via a join.
 *
 * Pro+ only (same gate as toggleSavedSite). Free / signed-out → [].
 */
export async function getSavedSites(): Promise<PlaybookItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (!profile || profile.plan === "free") return [];

  const { data, error } = await supabase
    .from("saved_sites")
    .select(
      "status, created_at, winning_sites(id,url,domain,title,niche,thumbnail_url,metrics,is_featured,ad_signals,teardown)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as Array<{
    status: PlaybookStatus | null;
    winning_sites: WinningSiteCard | WinningSiteCard[] | null;
  }>)
    .map((row) => {
      // Supabase may embed the to-one relation as an object or a 1-element
      // array depending on inference — normalize to a single site.
      const site = Array.isArray(row.winning_sites)
        ? row.winning_sites[0]
        : row.winning_sites;
      if (!site) return null;
      return {
        // Pro+ only path → metrics are never locked here.
        site: { ...site, metrics_locked: false },
        status: row.status === "applied" ? "applied" : "to_apply",
      } as PlaybookItem;
    })
    .filter((x): x is PlaybookItem => x !== null);
}

/**
 * Flip a saved store between "to_apply" and "applied". Pro+ only. Relies on the
 * `saved_sites: update own` RLS policy added in migration 0027.
 */
export async function setSavedStatus(
  siteId: string,
  status: PlaybookStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
      error: "The Playbook is a Pro feature. Upgrade to track your progress.",
    };
  }

  const { error } = await supabase
    .from("saved_sites")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("site_id", siteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/app/library");
  return { ok: true };
}
