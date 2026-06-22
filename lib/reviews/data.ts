import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_REVIEW_SETTINGS,
  type AdminReview,
  type PublicReview,
  type ReviewSettings,
} from "./types";

/**
 * Read the single review_settings row. Falls back to safe defaults if the
 * row — or the whole table (migration 0016 not applied yet) — is missing,
 * so the site NEVER breaks before the migration runs.
 */
export async function getReviewSettings(): Promise<ReviewSettings> {
  // Fail CLOSED: if the table/row can't be read (e.g. migration 0016 not
  // applied yet), the public section stays hidden — never a broken form.
  const hidden: ReviewSettings = { ...DEFAULT_REVIEW_SETTINGS, enabled: false };
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("review_settings")
      .select(
        "enabled, show_form, show_list, display_count, min_rating, auto_approve, heading, subheading",
      )
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return hidden;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    return {
      enabled: !!d.enabled,
      show_form: !!d.show_form,
      show_list: !!d.show_list,
      display_count: Number(d.display_count ?? 6),
      min_rating: Number(d.min_rating ?? 1),
      auto_approve: !!d.auto_approve,
      heading: d.heading ?? null,
      subheading: d.subheading ?? null,
    };
  } catch {
    return hidden;
  }
}

/**
 * Approved reviews for the PUBLIC list, already filtered by min_rating,
 * ordered (featured first, then newest) and limited to display_count.
 * Returns [] on any error so the caller can simply hide the list.
 */
export async function getPublicReviews(
  settings: ReviewSettings,
): Promise<PublicReview[]> {
  if (settings.display_count <= 0) return [];
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("reviews")
      .select("id, author_name, rating, title, body, featured, created_at")
      .eq("status", "approved")
      .gte("rating", settings.min_rating)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(settings.display_count);
    if (error || !Array.isArray(data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((r) => ({
      id: String(r.id),
      author_name: String(r.author_name ?? "Anonymous"),
      rating: Number(r.rating ?? 5),
      title: r.title ?? null,
      body: String(r.body ?? ""),
      featured: !!r.featured,
      created_at: String(r.created_at ?? ""),
    }));
  } catch {
    return [];
  }
}

/** Average rating + count across ALL approved reviews (not just the page). */
export async function getReviewStats(): Promise<{
  count: number;
  average: number;
}> {
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("reviews")
      .select("rating")
      .eq("status", "approved");
    if (error || !Array.isArray(data) || data.length === 0)
      return { count: 0, average: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ratings = (data as any[]).map((r) => Number(r.rating ?? 0));
    const sum = ratings.reduce((a, b) => a + b, 0);
    return {
      count: ratings.length,
      average: Math.round((sum / ratings.length) * 10) / 10,
    };
  } catch {
    return { count: 0, average: 0 };
  }
}

/**
 * ALL reviews for the owner moderation panel (every status, incl. private
 * email + pending/hidden). Newest first. Returns [] on error.
 */
export async function getAllReviewsForOwner(): Promise<AdminReview[]> {
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("reviews")
      .select(
        "id, author_name, author_email, rating, title, body, featured, status, created_at, approved_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error || !Array.isArray(data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((r) => ({
      id: String(r.id),
      author_name: String(r.author_name ?? "Anonymous"),
      author_email: r.author_email ?? null,
      rating: Number(r.rating ?? 5),
      title: r.title ?? null,
      body: String(r.body ?? ""),
      featured: !!r.featured,
      status: (r.status ?? "pending") as AdminReview["status"],
      created_at: String(r.created_at ?? ""),
      approved_at: r.approved_at ?? null,
    }));
  } catch {
    return [];
  }
}

/** True if the reviews tables look present (used by the owner panel hint). */
export async function reviewsTablesReady(): Promise<boolean> {
  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc.from("review_settings").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}
