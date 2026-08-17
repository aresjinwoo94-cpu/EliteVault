import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  DEFAULT_REVIEW_SETTINGS,
  type AdminReview,
  type MyReview,
  type PotentialSnapshot,
  type PublicReview,
  type ReviewPhoto,
  type ReviewSettings,
} from "./types";

/** Normalize a raw `photos` jsonb value into a clean {url, path}[] — tolerant
 *  of null / non-array / malformed entries so a bad row never breaks a query. */
export function normalizePhotos(raw: unknown): ReviewPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is { url: unknown; path: unknown } =>
        !!p && typeof p === "object",
    )
    .map((p) => ({ url: String(p.url ?? ""), path: String(p.path ?? "") }))
    .filter((p) => p.url && p.path);
}

/** Coerce a raw `potential_snapshot` jsonb value into a clean PotentialSnapshot,
 *  or null if it's missing / malformed / carries nothing renderable. Keeps the
 *  "no real data → flat card" promise even if a row is half-filled. */
export function normalizePotential(raw: unknown): PotentialSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.basis !== "meta_sim" && o.basis !== "cr_scenario") return null;

  const money = (
    v: unknown,
  ): { label: string; revenueMonthly: number } | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const m = v as Record<string, unknown>;
    const rev = Number(m.revenueMonthly);
    if (!Number.isFinite(rev)) return undefined;
    return { label: String(m.label ?? ""), revenueMonthly: rev };
  };
  const pct = (v: unknown): { low: number; high: number } | undefined => {
    if (!v || typeof v !== "object") return undefined;
    const p = v as Record<string, unknown>;
    const low = Number(p.low);
    const high = Number(p.high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
    return { low, high };
  };

  const snap: PotentialSnapshot = {
    currency: String(o.currency ?? "USD"),
    basis: o.basis,
    note: o.note != null ? String(o.note) : undefined,
  };
  const cur = money(o.current);
  if (cur) snap.current = cur;
  const pot = money(o.potential);
  if (pot) snap.potential = pot;
  const up = pct(o.upsidePct);
  if (up) snap.upsidePct = up;

  // Must carry something the UI can draw, else treat as no data (flat card).
  if (!snap.current && !snap.potential && !snap.upsidePct) return null;
  return snap;
}

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
        "enabled, show_form, show_list, display_count, min_rating, auto_approve, heading, subheading, allow_photos, max_photos, show_review_stats",
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
      allow_photos: !!d.allow_photos,
      max_photos: Number(d.max_photos ?? 4),
      show_review_stats: !!d.show_review_stats,
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
  // Verified stats are exposed ONLY when the owner switch is ON. When OFF we
  // don't even select the columns, so the public query and the resulting cards
  // are byte-for-byte what they were before migration 0029.
  const statsOn = settings.show_review_stats === true;
  const columns =
    "id, author_name, rating, title, body, store_name, featured, created_at, photos" +
    (statsOn ? ", audits_run, potential_snapshot, verified" : "");
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("reviews")
      .select(columns)
      .eq("status", "approved")
      // Only rows the author consented to publish (default true for legacy
      // testimonials; the signed-in form requires an explicit checkbox).
      .eq("consent_public", true)
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
      store_name: r.store_name ?? null,
      featured: !!r.featured,
      created_at: String(r.created_at ?? ""),
      photos: normalizePhotos(r.photos),
      // Gated: null/null/false whenever the owner switch is OFF.
      audits_run:
        statsOn && r.audits_run != null ? Number(r.audits_run) : null,
      potential: statsOn ? normalizePotential(r.potential_snapshot) : null,
      verified: statsOn ? !!r.verified : false,
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
        "id, author_name, author_email, rating, title, body, store_name, store_url, featured, status, created_at, approved_at, photos, audits_run, potential_snapshot, verified",
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
      store_name: r.store_name ?? null,
      store_url: r.store_url ?? null,
      featured: !!r.featured,
      status: (r.status ?? "pending") as AdminReview["status"],
      created_at: String(r.created_at ?? ""),
      approved_at: r.approved_at ?? null,
      photos: normalizePhotos(r.photos),
      // Owner sees the raw verify state (NOT gated by show_review_stats — that
      // switch only controls PUBLIC exposure).
      audits_run: r.audits_run != null ? Number(r.audits_run) : null,
      potential: normalizePotential(r.potential_snapshot),
      verified: !!r.verified,
    }));
  } catch {
    return [];
  }
}

/**
 * The signed-in user's OWN review (any status), for prefill / edit / delete on
 * the submission page. Returns null if they have none. Server-only; the caller
 * passes the authenticated user id.
 */
export async function getMyReview(userId: string): Promise<MyReview | null> {
  if (!userId) return null;
  try {
    const svc = createSupabaseServiceClient();
    const { data, error } = await svc
      .from("reviews")
      .select("id, rating, body, author_name, store_name, store_url, status, created_at, photos")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return {
      id: String(r.id),
      rating: Number(r.rating ?? 5),
      body: String(r.body ?? ""),
      display_name: String(r.author_name ?? ""),
      store_name: r.store_name ?? null,
      store_url: r.store_url ?? null,
      status: (r.status ?? "pending") as MyReview["status"],
      created_at: String(r.created_at ?? ""),
      photos: normalizePhotos(r.photos),
    };
  } catch {
    return null;
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
