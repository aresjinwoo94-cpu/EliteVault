/**
 * What counts as a REAL Library thumbnail (brief oct-2026 §L.3).
 *
 * Pure and import-free so the publication gate, the refresh job, the CLI
 * scripts and the tests all agree. A live `s.wordpress.com/mshots` URL, an
 * empty string or null is NOT an image: mshots re-renders someone else's site
 * at page-load and answers a blank placeholder on a cold cache, and the cards
 * deliberately drop it — so a row holding one would publish as a letter tile.
 */

export const THUMBNAIL_SOURCES = ["owner", "capture", "og_image"] as const;
export type ThumbnailSource = (typeof THUMBNAIL_SOURCES)[number];

/** `review_reason` values the image pipeline and the cleanup use. */
export const REVIEW_REASON = {
  noImage: "no_image",
  notAStore: "not_a_store",
} as const;

export function isRealThumbnail(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  if (/s\.wordpress\.com\/mshots/i.test(u)) return false;
  return true;
}

/** Owner-uploaded images are protected: no job may replace or clear them. */
export function isProtectedThumbnail(row: { thumbnail_source?: string | null }): boolean {
  return row.thumbnail_source === "owner";
}
