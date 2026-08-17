"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createSupabaseServiceClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { getOwner } from "@/lib/admin/guard";
import { getReviewSettings, normalizePhotos } from "@/lib/reviews/data";
import type { PotentialSnapshot } from "@/lib/reviews/types";
import {
  conversionScenarioBands,
  scenarioMidpoints,
} from "@/lib/analyzer/conversion-scenarios";
import { sendEmail } from "@/lib/email/resend";

// ── Public: submit a review ─────────────────────────────────────────────────

const SubmitInput = z.object({
  author_name: z.string().trim().min(2, "Please enter your name").max(60),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional().or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(10, "Tell us a little more (10+ characters)")
    .max(1000),
  author_email: z.string().trim().email().max(160).optional().or(z.literal("")),
  // Honeypot — real users leave this empty; bots fill every field.
  company: z.string().max(0).optional(),
});

export type SubmitReviewResult =
  | { ok: true; pending: boolean }
  | { ok: false; error: string };

function ownerNotifyEmail(): string | null {
  const first = (v?: string) =>
    v?.split(",").map((s) => s.trim()).filter(Boolean)[0];
  return (
    process.env.OWNER_NOTIFY_EMAIL ||
    first(process.env.ADMIN_EMAILS) ||
    first(process.env.INTERNAL_EMAILS) ||
    null
  );
}

export async function submitReview(
  input: z.infer<typeof SubmitInput>,
): Promise<SubmitReviewResult> {
  const parsed = SubmitInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid review",
    };
  }
  // Honeypot tripped → pretend success, drop silently.
  if (parsed.data.company && parsed.data.company.length > 0) {
    return { ok: true, pending: true };
  }

  const settings = await getReviewSettings();
  // Respect the owner's master switch and form toggle on the server too —
  // never accept a submission for a surface the owner turned off.
  if (!settings.enabled || !settings.show_form) {
    return { ok: false, error: "Reviews are not open right now." };
  }

  const status = settings.auto_approve ? "approved" : "pending";
  const email = parsed.data.author_email?.trim() || null;

  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc.from("reviews").insert({
      author_name: parsed.data.author_name,
      author_email: email,
      rating: parsed.data.rating,
      title: parsed.data.title?.trim() || null,
      body: parsed.data.body,
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    if (error) return { ok: false, error: "Could not save your review." };
  } catch {
    return { ok: false, error: "Could not save your review." };
  }

  // Best-effort owner notification — never blocks or fails the submission.
  try {
    const to = ownerNotifyEmail();
    if (to) {
      const stars = "★".repeat(parsed.data.rating) + "☆".repeat(5 - parsed.data.rating);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
      await sendEmail({
        to,
        subject: `New review (${parsed.data.rating}/5) from ${parsed.data.author_name}${status === "pending" ? " — needs approval" : ""}`,
        html: `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#14141B">
            <h2 style="margin:0 0 4px">New EliteVault review</h2>
            <p style="color:#6b7280;margin:0 0 16px">${status === "pending" ? "Pending your approval." : "Auto-approved and live."}</p>
            <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px">
              <div style="font-size:18px;color:#d4a017">${stars} <span style="color:#6b7280;font-size:13px">(${parsed.data.rating}/5)</span></div>
              ${parsed.data.title ? `<p style="font-weight:700;margin:8px 0 4px">${escapeHtml(parsed.data.title)}</p>` : ""}
              <p style="margin:6px 0;white-space:pre-wrap">${escapeHtml(parsed.data.body)}</p>
              <p style="color:#6b7280;font-size:13px;margin:10px 0 0">— ${escapeHtml(parsed.data.author_name)}${email ? ` &lt;${escapeHtml(email)}&gt;` : ""}</p>
            </div>
            <p style="margin:18px 0 0"><a href="${appUrl}/app/owner" style="color:#0d9488">Manage reviews in your owner panel →</a></p>
          </div>`,
      });
    }
  } catch {
    // ignore — notification is non-critical
  }

  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true, pending: status === "pending" };
}

// ── Signed-in users: submit / edit / delete THEIR OWN review ────────────────

const UserSubmitInput = z.object({
  rating: z.coerce.number().int().min(1, "Pick a rating").max(5),
  body: z
    .string()
    .trim()
    .min(20, "Tell us a little more (20+ characters)")
    .max(500, "Keep it under 500 characters"),
  display_name: z.string().trim().min(2, "Please enter a name").max(60),
  store_name: z.string().trim().max(80).optional().or(z.literal("")),
  store_url: z.string().trim().max(200).optional().or(z.literal("")),
  // Required to publish — the checkbox must be checked.
  consent_public: z.literal(true, {
    errorMap: () => ({ message: "Please allow us to show your review publicly." }),
  }),
});

export type UserReviewResult =
  | { ok: true; pending: boolean }
  | { ok: false; error: string };

/**
 * Submit (or edit-in-place) the signed-in user's review. Auth is required and
 * the review is tied to their user_id — one review per account (enforced by a
 * unique index + upsert). Any edit resets it to `pending` for re-moderation
 * (unless the owner enabled auto-approve). Body is stored as plain text and
 * rendered via React (auto-escaped), so no HTML can execute.
 */
export async function submitUserReview(
  input: z.infer<typeof UserSubmitInput>,
): Promise<UserReviewResult> {
  const parsed = UserSubmitInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review" };
  }

  // Auth gate — only signed-in users may submit.
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return { ok: false, error: "Please sign in to leave a review." };

  const settings = await getReviewSettings();
  if (!settings.enabled || !settings.show_form) {
    return { ok: false, error: "Reviews are not open right now." };
  }

  const status = settings.auto_approve ? "approved" : "pending";
  const d = parsed.data;
  const row = {
    user_id: userId,
    author_name: d.display_name,
    rating: d.rating,
    body: d.body,
    store_name: d.store_name?.trim() || null,
    store_url: d.store_url?.trim() || null,
    consent_public: true,
    status,
    approved_at: status === "approved" ? new Date().toISOString() : null,
    source: "app",
  };

  try {
    const svc = createSupabaseServiceClient();
    // Rate-limit / anti-spam: exactly one review per user. Update in place if
    // they already have one, otherwise insert.
    const { data: existing } = await svc
      .from("reviews")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing && (existing as { id?: string }).id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (svc.from("reviews") as any)
        .update(row)
        .eq("user_id", userId);
      if (error) return { ok: false, error: "Could not save your review." };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (svc.from("reviews") as any).insert(row);
      if (error) return { ok: false, error: "Could not save your review." };
    }
  } catch {
    return { ok: false, error: "Could not save your review." };
  }

  // Best-effort owner notification (never blocks the submission).
  try {
    const to = ownerNotifyEmail();
    if (to) {
      const stars = "★".repeat(d.rating) + "☆".repeat(5 - d.rating);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";
      await sendEmail({
        to,
        subject: `New review (${d.rating}/5) from ${d.display_name}${status === "pending" ? " — needs approval" : ""}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#14141B">
          <h2 style="margin:0 0 4px">New EliteVault review</h2>
          <p style="color:#6b7280;margin:0 0 16px">${status === "pending" ? "Pending your approval." : "Auto-approved and live."}</p>
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px">
            <div style="font-size:18px;color:#d4a017">${stars} <span style="color:#6b7280;font-size:13px">(${d.rating}/5)</span></div>
            <p style="margin:6px 0;white-space:pre-wrap">${escapeHtml(d.body)}</p>
            <p style="color:#6b7280;font-size:13px;margin:10px 0 0">— ${escapeHtml(d.display_name)}${d.store_name ? ` · ${escapeHtml(d.store_name)}` : ""}</p>
          </div>
          <p style="margin:18px 0 0"><a href="${appUrl}/app/owner" style="color:#0d9488">Manage reviews →</a></p>
        </div>`,
      });
    }
  } catch {
    // ignore — non-critical
  }

  revalidatePath("/");
  revalidatePath("/app/review");
  revalidatePath("/app/owner");
  return { ok: true, pending: status === "pending" };
}

/** Delete the signed-in user's OWN review (they can remove it at any time). */
export async function deleteMyReview(): Promise<{ ok: boolean; error?: string }> {
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return { ok: false, error: "Please sign in." };

  try {
    const svc = createSupabaseServiceClient();
    // Ownership is enforced by the user_id filter — a user can only ever
    // delete their own row.
    const { error } = await svc.from("reviews").delete().eq("user_id", userId);
    if (error) return { ok: false, error: "Could not delete your review." };
  } catch {
    return { ok: false, error: "Could not delete your review." };
  }
  revalidatePath("/");
  revalidatePath("/app/review");
  revalidatePath("/app/owner");
  return { ok: true };
}

// ── Owner-only: moderation + settings ───────────────────────────────────────

async function assertOwner() {
  const owner = await getOwner();
  if (!owner) throw new Error("Unauthorized");
}

const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  show_form: z.boolean().optional(),
  show_list: z.boolean().optional(),
  display_count: z.coerce.number().int().min(0).max(60).optional(),
  min_rating: z.coerce.number().int().min(1).max(5).optional(),
  auto_approve: z.boolean().optional(),
  heading: z.string().max(120).nullable().optional(),
  subheading: z.string().max(240).nullable().optional(),
  allow_photos: z.boolean().optional(),
  max_photos: z.coerce.number().int().min(0).max(10).optional(),
  show_review_stats: z.boolean().optional(),
});

export async function updateReviewSettings(
  patch: z.infer<typeof SettingsPatch>,
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  const parsed = SettingsPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid settings" };
  try {
    const svc = createSupabaseServiceClient();
    // The hand-written Database type doesn't include these tables, so the
    // typed builder infers a `never` row. Cast the builder (matches the
    // service-client pattern used elsewhere, e.g. sitemap.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("review_settings") as any)
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

export async function setReviewStatus(
  id: string,
  status: "pending" | "approved" | "hidden" | "rejected",
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  try {
    const svc = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("reviews") as any)
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

export async function setReviewFeatured(
  id: string,
  featured: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  try {
    const svc = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("reviews") as any)
      .update({ featured })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

export async function deleteReview(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await assertOwner();
  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc.from("reviews").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/");
  revalidatePath("/app/owner");
  return { ok: true };
}

// ── Owner-only: derive VERIFIED stats for a review (owner-driven, like photos) ─
//
// Money is NEVER invented: every figure is the exact number that reviewer
// already saw in their own report. Two honest bases:
//   • meta_sim    → two REAL scenarios from their latest Meta simulation
//                   (conservative → aggressive 7-day revenue at their own
//                   AOV/budget). Labeled with the timeframe so nothing implies
//                   a made-up "monthly" figure.
//   • cr_scenario → a clearly MODELED conversion-upside % range from
//                   (score, niche), when no meta-sim exists. Always captioned
//                   "estimate, not a promise" in the UI.

/** Bare domain of a URL for matching a review's store_url to an analysis url —
 *  lowercased, no scheme / www / path. Empty string if unparseable. */
function bareDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, ""); // scheme
  s = s.replace(/^www\./, "");
  s = s.split(/[/?#]/)[0] ?? ""; // path / query / hash
  return s;
}

/** Revenue of one persisted meta-simulation scenario (SimulationScenario). The
 *  exact integer USD the scenario card showed the user (totals.revenue). */
function scenarioRevenue(s: unknown): number | null {
  if (!s || typeof s !== "object") return null;
  const totals = (s as { totals?: unknown }).totals;
  if (!totals || typeof totals !== "object") return null;
  const r = Number((totals as { revenue?: unknown }).revenue);
  return Number.isFinite(r) && r > 0 ? Math.round(r) : null;
}

/** Build a meta_sim snapshot from a succeeded simulation row: current/potential
 *  are the lowest/highest-revenue scenarios the user actually saw. Returns null
 *  if no scenario carries a usable revenue. */
function potentialFromSim(sim: {
  conservative: unknown;
  balanced: unknown;
  aggressive: unknown;
}): PotentialSnapshot | null {
  const points: { label: string; revenue: number }[] = [];
  for (const [label, s] of [
    ["Conservador", sim.conservative],
    ["Balanceado", sim.balanced],
    ["Agresivo", sim.aggressive],
  ] as const) {
    const revenue = scenarioRevenue(s);
    if (revenue != null) points.push({ label, revenue });
  }
  if (points.length === 0) return null;

  const lo = points.reduce((a, b) => (b.revenue < a.revenue ? b : a));
  const hi = points.reduce((a, b) => (b.revenue > a.revenue ? b : a));

  const snap: PotentialSnapshot = {
    currency: "USD",
    basis: "meta_sim",
    periodLabel: "Proyección Meta · 7 días",
    note: "modelado, no una promesa",
    potential: { label: hi.label, revenue: hi.revenue },
  };
  // Only show a "from → to" jump when there are two genuinely distinct points.
  if (lo.label !== hi.label && lo.revenue !== hi.revenue) {
    snap.current = { label: lo.label, revenue: lo.revenue };
  }
  return snap;
}

/** Fallback when there's no meta-sim: a MODELED conversion-upside % range from
 *  the same deterministic (score, niche) functions the report itself uses —
 *  the lift a well-run ("good") acquisition has over an average ("regular") one
 *  at this store's level. Clearly labeled modeled; never a promise. */
function potentialFromScenarios(
  score: number,
  niche: string | null,
): PotentialSnapshot | null {
  const mids = scenarioMidpoints(score, niche);
  if (!(mids.meta_ads_regular > 0) || !(mids.meta_ads_good > 0)) return null;
  const bands = conversionScenarioBands(score, niche);
  const reg = bands.find((b) => b.key === "meta_ads_regular");
  const good = bands.find((b) => b.key === "meta_ads_good");
  if (!reg || !good || reg.low <= 0) return null;

  const low = Math.max(0, Math.round((good.low / reg.high - 1) * 100));
  const high = Math.round((good.high / reg.low - 1) * 100);
  if (!(high > 0)) return null;

  return {
    currency: "USD",
    basis: "cr_scenario",
    upsidePct: { low, high: Math.max(high, low) },
    note: "modelado a partir de tu score y nicho — estimación, no una promesa",
  };
}

export type RefreshStatsResult =
  | {
      ok: true;
      verified: boolean;
      audits_run: number | null;
      potential: PotentialSnapshot | null;
    }
  | { ok: false; error: string };

/**
 * Owner-only: (re)compute a review's verified stats from the author account's
 * REAL data and persist the snapshot. Same owner-driven pattern as the photo
 * flow. Public exposure is still gated by the show_review_stats switch.
 */
export async function refreshReviewStats(
  reviewId: string,
): Promise<RefreshStatsResult> {
  await assertOwner();
  if (!reviewId) return { ok: false, error: "Falta el id de la reseña" };

  try {
    const svc = createSupabaseServiceClient();

    // 1) Load the review's private link fields.
    const { data: review } = await svc
      .from("reviews")
      .select("id, user_id, store_url")
      .eq("id", reviewId)
      .maybeSingle();
    if (!review) return { ok: false, error: "Reseña no encontrada" };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rv = review as any;
    const userId: string | null = rv.user_id ?? null;
    const storeUrl: string | null = rv.store_url ?? null;

    const clearFlat = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc.from("reviews") as any)
        .update({
          verified: false,
          audits_run: null,
          potential_snapshot: null,
          verified_at: null,
        })
        .eq("id", reviewId);
      revalidatePath("/");
      revalidatePath("/app/owner");
    };

    // No linked account → cannot verify. Reset to a flat card.
    if (!userId) {
      await clearFlat();
      return { ok: true, verified: false, audits_run: null, potential: null };
    }

    // 2) audits_run = # of succeeded analyses for this account.
    const { count } = await svc
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "succeeded");
    const auditsRun = count ?? 0;

    // No real audits → not verifiable; flat card (same as today).
    if (auditsRun <= 0) {
      await clearFlat();
      return { ok: true, verified: false, audits_run: null, potential: null };
    }

    // 3) Pick a representative succeeded analysis: domain-match store_url, else
    //    the most recent one.
    const { data: rows } = await svc
      .from("analyses")
      .select("id, url, result, detected_niche, created_at")
      .eq("user_id", userId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analyses = (Array.isArray(rows) ? rows : []) as any[];
    let chosen = analyses[0] ?? null;
    const target = bareDomain(storeUrl);
    if (target) {
      const match = analyses.find((a) => bareDomain(a.url) === target);
      if (match) chosen = match;
    }

    // 4) Derive the money potential from that analysis (real numbers only).
    let potential: PotentialSnapshot | null = null;
    if (chosen) {
      const { data: sims } = await svc
        .from("meta_simulations")
        .select("conservative, balanced, aggressive")
        .eq("analysis_id", chosen.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sim = (Array.isArray(sims) ? sims[0] : null) as any;
      if (sim) potential = potentialFromSim(sim);
      if (!potential) {
        const score = Number((chosen.result as { score?: unknown })?.score ?? 0);
        potential = potentialFromScenarios(score, chosen.detected_niche ?? null);
      }
    }

    // Real audits exist → verified, even if the money snapshot is null.
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (svc.from("reviews") as any)
      .update({
        verified: true,
        audits_run: auditsRun,
        potential_snapshot: potential,
        verified_at: now,
      })
      .eq("id", reviewId);
    if (updErr) return { ok: false, error: updErr.message };

    revalidatePath("/");
    revalidatePath("/app/owner");
    return { ok: true, verified: true, audits_run: auditsRun, potential };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Review photos ───────────────────────────────────────────────────────────
//
// Reuses the existing public "screenshots" bucket (migration 0002) with a
// `reviews/` prefix — the same pattern Library uses. NOTE: that bucket's
// allowed_mime_types is png/jpeg/webp only (NO avif), so we validate against
// exactly that set even though a sibling component's <input> loosely accepts
// avif. Owner uploads never change status; user uploads re-enter moderation.

const PHOTO_BUCKET = "screenshots";
const PHOTO_PREFIX = "reviews";
const PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8MB — same as library-images.ts

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type PhotoFileOk = { ok: true; file: File; ext: string };
type PhotoFileErr = { ok: false; error: string };

/** Validate an uploaded photo against the bucket's real constraints (png/jpeg/
 *  webp, ≤8MB). Same rejection messages spirit as uploadLibraryImage. */
function validatePhotoFile(entry: FormDataEntryValue | null): PhotoFileOk | PhotoFileErr {
  if (!(entry instanceof File) || entry.size === 0)
    return { ok: false, error: "Elige una imagen" };
  if (entry.size > PHOTO_MAX_BYTES)
    return { ok: false, error: "La imagen es muy grande (máx. 8MB)" };
  const ext = PHOTO_EXT[entry.type.toLowerCase()];
  if (!ext) return { ok: false, error: "Usa una imagen JPG, PNG o WebP" };
  return { ok: true, file: entry, ext };
}

type PhotoActionResult = { ok: boolean; error?: string };

// ── Owner: add / remove a photo on ANY review ───────────────────────────────

/**
 * Owner-only: attach a photo to any review (approved / pending / hidden). The
 * fast path that unblocks users today — the owner receives their photos out of
 * band and uploads them here. Does NOT change the review's status: the owner is
 * trusted, so an approved review stays public with the new photo immediately.
 */
export async function ownerUploadReviewPhoto(
  formData: FormData,
): Promise<PhotoActionResult> {
  await assertOwner();
  const reviewId = String(formData.get("reviewId") || "");
  if (!reviewId) return { ok: false, error: "Falta el id de la reseña" };
  const v = validatePhotoFile(formData.get("file"));
  if (!v.ok) return v;

  try {
    const svc = createSupabaseServiceClient();
    const settings = await getReviewSettings();
    const { data: row } = await svc
      .from("reviews")
      .select("id, photos")
      .eq("id", reviewId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Reseña no encontrada" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = normalizePhotos((row as any).photos);
    if (current.length >= settings.max_photos)
      return { ok: false, error: "Ya alcanzó el máximo de fotos" };

    const path = `${PHOTO_PREFIX}/${reviewId}-${Date.now()}-${current.length}.${v.ext}`;
    const buf = Buffer.from(await v.file.arrayBuffer());
    const { error: upErr } = await svc.storage
      .from(PHOTO_BUCKET)
      .upload(path, buf, { contentType: v.file.type, upsert: true });
    if (upErr) return { ok: false, error: `Error al subir: ${upErr.message}` };

    const {
      data: { publicUrl },
    } = svc.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    const next = [...current, { url: publicUrl, path }];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (svc.from("reviews") as any)
      .update({ photos: next })
      .eq("id", reviewId);
    if (updErr) {
      // Don't leave an orphaned object behind if the row update failed.
      await svc.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {});
      return { ok: false, error: `No se pudo guardar: ${updErr.message}` };
    }

    revalidatePath("/");
    revalidatePath("/app/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Owner-only: remove a photo from any review (deletes the object too). */
export async function ownerRemoveReviewPhoto(
  reviewId: string,
  path: string,
): Promise<PhotoActionResult> {
  await assertOwner();
  if (!reviewId || !path) return { ok: false, error: "Datos incompletos" };
  try {
    const svc = createSupabaseServiceClient();
    const { data: row } = await svc
      .from("reviews")
      .select("id, photos")
      .eq("id", reviewId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Reseña no encontrada" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = normalizePhotos((row as any).photos).filter((p) => p.path !== path);
    await svc.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("reviews") as any)
      .update({ photos: next })
      .eq("id", reviewId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/");
    revalidatePath("/app/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── Signed-in users: add / remove photos on THEIR OWN review ─────────────────

/** Resolve the signed-in user id, or null if there's no session. */
async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Self-service: the signed-in user adds a photo to their OWN review. Gated by
 * the owner's `allow_photos` switch. Requires an existing review (no photo
 * without a review). Adding a photo re-enters moderation (status → pending)
 * unless auto-approve is on — same rule submitUserReview applies to any edit.
 */
export async function uploadMyReviewPhoto(
  formData: FormData,
): Promise<PhotoActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Inicia sesión para añadir fotos." };

  const settings = await getReviewSettings();
  if (!settings.enabled || !settings.allow_photos)
    return { ok: false, error: "El propietario no habilitó las fotos por ahora." };

  const v = validatePhotoFile(formData.get("file"));
  if (!v.ok) return v;

  try {
    const svc = createSupabaseServiceClient();
    const { data: row } = await svc
      .from("reviews")
      .select("id, photos")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Primero escribe tu reseña." };

    const reviewId = String((row as { id: string }).id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = normalizePhotos((row as any).photos);
    if (current.length >= settings.max_photos)
      return { ok: false, error: "Ya alcanzaste el máximo de fotos" };

    const path = `${PHOTO_PREFIX}/${reviewId}-${Date.now()}-${current.length}.${v.ext}`;
    const buf = Buffer.from(await v.file.arrayBuffer());
    const { error: upErr } = await svc.storage
      .from(PHOTO_BUCKET)
      .upload(path, buf, { contentType: v.file.type, upsert: true });
    if (upErr) return { ok: false, error: `Error al subir: ${upErr.message}` };

    const {
      data: { publicUrl },
    } = svc.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    const next = [...current, { url: publicUrl, path }];

    // New user content → re-moderate (unless auto-approve).
    const status = settings.auto_approve ? "approved" : "pending";
    const { error: updErr } = await (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      svc.from("reviews") as any
    )
      .update({
        photos: next,
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      // Ownership: a user can only ever touch their own row.
      .eq("user_id", userId);
    if (updErr) {
      await svc.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {});
      return { ok: false, error: `No se pudo guardar: ${updErr.message}` };
    }

    revalidatePath("/");
    revalidatePath("/app/review");
    revalidatePath("/app/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Self-service: the signed-in user removes one of their OWN photos. Ownership
 * is enforced by the user_id filter AND by checking the path belongs to their
 * review. Removing content does NOT re-enter moderation.
 */
export async function removeMyReviewPhoto(
  path: string,
): Promise<PhotoActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Inicia sesión." };
  if (!path) return { ok: false, error: "Datos incompletos" };

  try {
    const svc = createSupabaseServiceClient();
    const { data: row } = await svc
      .from("reviews")
      .select("id, photos")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return { ok: false, error: "No encontramos tu reseña." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = normalizePhotos((row as any).photos);
    if (!current.some((p) => p.path === path))
      return { ok: false, error: "Esa foto no es tuya." };

    const next = current.filter((p) => p.path !== path);
    await svc.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from("reviews") as any)
      .update({ photos: next })
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/");
    revalidatePath("/app/review");
    revalidatePath("/app/owner");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
