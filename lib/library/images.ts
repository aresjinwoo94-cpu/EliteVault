import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { captureViaOgImage } from "@/lib/screenshot-core";
import { judgeStore } from "@/lib/library/quality";
import { assessHeroImage } from "@/lib/library/image-quality";
import type { StoreEvidence } from "@/lib/library/store-check";
import {
  isProtectedThumbnail,
  isRealThumbnail,
  REVIEW_REASON,
  type ThumbnailSource,
} from "@/lib/library/thumbnail";

/**
 * Low-priority image job for the Library (WP-L1, brief oct-2026 §L.3 #5).
 *
 * Gets a REAL hero image for rows that don't have one and, once a row has an
 * image and passes the publication gate, publishes it again on its own.
 *
 * Isolation from the Analyzer — this job must never compete with user audits
 *     or spend their provider quota:
 *   • it fetches ONLY the store's own og:image (a plain request to the store's
 *     site). It never goes through `captureScreenshot` and touches NONE of the
 *     Analyzer's capture providers: ScreenshotOne (paid, scarce quota), thum.io
 *     (the Analyzer's keyless first free fallback — a shared per-IP limit),
 *     Microlink (per-IP daily cap) or mshots. Hero VIEWPORT captures for stores
 *     whose og:image fails are left to a manual/off-Vercel run — see the WP-L1
 *     notes; do not add thum.io here without checking the Analyzer's headroom;
 *   • the Inngest function runs with concurrency 1, a few stores per run, on a
 *     slow cron, one store per step, with a pause between stores.
 *
 * Rows an owner has uploaded an image for are never selected, never touched
 * (and migration 0040's trigger refuses it anyway).
 */

const BUCKET = "screenshots";
const PREFIX = "library";
/** After this many failed attempts a row waits for a manual upload. */
export const MAX_IMAGE_ATTEMPTS = 3;
/** Image fetched but held back from publishing until a human has looked at it (manual runs only). */
export const HELD_REASON = "image_pending_review";
/** Don't retry the same row sooner than this. */
const RETRY_COOLDOWN_MS = 20 * 3600_000;

export interface MissingImageRow {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  niche: string | null;
  status: string;
  is_live: boolean;
  thumbnail_url: string | null;
  thumbnail_source: string | null;
  thumbnail_attempts: number;
  thumbnail_checked_at: string | null;
  review_reason: string | null;
  active_ads_count: number | null;
  internal_score: number | null;
  store_checks: StoreEvidence | null;
}

const COLUMNS =
  "id, url, domain, title, niche, status, is_live, thumbnail_url, thumbnail_source, thumbnail_attempts, thumbnail_checked_at, review_reason, active_ads_count, internal_score, store_checks";

/** Next rows to work on: published first (they're visible), then drafts/review. */
export async function pickMissingImageRows(limit: number): Promise<MissingImageRow[]> {
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("winning_sites")
    .select(COLUMNS)
    .or("thumbnail_url.is.null,thumbnail_url.eq.,thumbnail_url.ilike.*mshots*")
    .lt("thumbnail_attempts", MAX_IMAGE_ATTEMPTS)
    .order("thumbnail_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit * 4);
  if (error) throw new Error(`pickMissingImageRows: ${error.message}`);
  const now = Date.now();
  const rows = ((data ?? []) as unknown as MissingImageRow[]).filter(
    (r) =>
      !isProtectedThumbnail(r) &&
      r.review_reason !== REVIEW_REASON.notAStore &&
      !isRealThumbnail(r.thumbnail_url) &&
      (!r.thumbnail_checked_at || now - new Date(r.thumbnail_checked_at).getTime() > RETRY_COOLDOWN_MS),
  );
  const rank = (s: string) => (s === "published" ? 0 : s === "review" ? 1 : 2);
  return rows.sort((a, b) => rank(a.status) - rank(b.status)).slice(0, limit);
}

/** The store's own og:image — the only source the automatic job uses (see header). */
export async function fetchHeroImage(
  url: string,
): Promise<{ buf: Buffer; mediaType: "image/png" | "image/jpeg"; source: ThumbnailSource } | null> {
  try {
    const og = await captureViaOgImage(url, 15_000);
    return { buf: Buffer.from(og.base64, "base64"), mediaType: og.mediaType, source: "og_image" };
  } catch {
    return null;
  }
}

/**
 * The row update that stores a new image and, when the row was parked FOR the
 * missing image and now passes the publication gate, publishes it again.
 * Anything parked for another reason (wrong niche, not live, …) stays put.
 * Shared by the job and the owner's manual upload.
 */
export function imageSavePatch(
  row: Pick<
    MissingImageRow,
    "url" | "domain" | "title" | "niche" | "status" | "is_live" | "review_reason" | "active_ads_count" | "internal_score" | "store_checks"
  >,
  publicUrl: string,
  source: ThumbnailSource,
  opts: { hold?: boolean } = {},
): { patch: Record<string, unknown>; publish: boolean } {
  const verdict = judgeStore({
    url: row.url,
    domain: row.domain,
    title: row.title,
    niche: row.niche,
    isLive: row.is_live,
    thumbnailUrl: publicUrl,
    evidence: row.store_checks,
    activeAdsCount: row.active_ads_count,
    internalScore: row.internal_score,
  });
  const wasParkedForImage =
    row.status !== "published" &&
    (row.review_reason === REVIEW_REASON.noImage || row.review_reason == null);
  const publish = verdict.status === "published" && wasParkedForImage && !opts.hold;
  return {
    publish,
    patch: {
      thumbnail_url: publicUrl,
      thumbnail_source: source,
      ...(publish
        ? { status: "published", review_reason: null }
        : opts.hold && verdict.status === "published" && wasParkedForImage
          ? { review_reason: HELD_REASON }
        : row.review_reason === REVIEW_REASON.noImage
          ? { review_reason: verdict.reasons[0] ?? null }
          : {}),
    },
  };
}

export interface FillOutcome {
  id: string;
  domain: string;
  ok: boolean;
  source?: ThumbnailSource;
  published?: boolean;
  note?: string;
}

/** Process one row: fetch, upload, save, and re-publish when it passes the gate. */
export async function fillOneImage(
  row: MissingImageRow,
  opts: { hold?: boolean } = {},
): Promise<FillOutcome> {
  const svc = createSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sites = svc.from("winning_sites") as any;
  const stamp = { thumbnail_checked_at: new Date().toISOString() };

  const hero = await fetchHeroImage(row.url);
  if (!hero) {
    await sites
      .update({ ...stamp, thumbnail_attempts: (row.thumbnail_attempts ?? 0) + 1 })
      .eq("id", row.id);
    return { id: row.id, domain: row.domain, ok: false, note: "no capture and no og:image" };
  }

  // Acceptance: a logo on a flat background or a tiny/odd crop is NOT a store hero —
  // reject it and leave the row for a manual upload (see image-quality.ts).
  const quality = await assessHeroImage(hero.buf);
  if (!quality.ok) {
    await sites
      .update({ ...stamp, thumbnail_attempts: (row.thumbnail_attempts ?? 0) + 1 })
      .eq("id", row.id);
    return { id: row.id, domain: row.domain, ok: false, note: `rejected: ${quality.reason}` };
  }

  const ext = hero.mediaType === "image/png" ? "png" : "jpg";
  const path = `${PREFIX}/${row.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, hero.buf, { contentType: hero.mediaType, upsert: true });
  if (upErr) {
    await sites
      .update({ ...stamp, thumbnail_attempts: (row.thumbnail_attempts ?? 0) + 1 })
      .eq("id", row.id);
    return { id: row.id, domain: row.domain, ok: false, note: `upload: ${upErr.message}` };
  }
  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);

  const { patch, publish } = imageSavePatch(row, publicUrl, hero.source, opts);
  const { error: updErr } = await sites
    .update({ ...patch, ...stamp, thumbnail_attempts: 0 })
    .eq("id", row.id);
  if (updErr) {
    await svc.storage.from(BUCKET).remove([path]).catch(() => {});
    return { id: row.id, domain: row.domain, ok: false, note: `save: ${updErr.message}` };
  }
  return { id: row.id, domain: row.domain, ok: true, source: hero.source, published: publish };
}
