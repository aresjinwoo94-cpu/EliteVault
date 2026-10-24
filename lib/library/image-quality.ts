import "server-only";

/**
 * Acceptance check for an automatically fetched Library image (WP-L1). An og:image
 * is whatever the brand chose for link previews, and often it is NOT a picture of the
 * store: a flat logo on a solid background (Gymshark, Peloton) or a tiny/strange crop.
 * Those must not become a card's hero — they go to manual upload instead.
 *
 * The checks are deliberately simple and explainable:
 *   • size: ≥ 600×300 and a landscape-ish ratio (1.0–2.6);
 *   • not flat: after shrinking to 48×48 and quantizing colours to 4 bits/channel, the image
 *     must have at least MIN_COLOR_BUCKETS colours that each cover ≥ 1% of it, and no single
 *     colour may cover more than MAX_DOMINANT of it (or the image must have ≥ MIN_DISTINCT_BUCKETS
 *     distinct colours, for soft gradients). A logo on a flat background has 2–5 significant
 *     colours and one huge background bucket; a photo has dozens.
 * Watermarks / cookie banners: og:images are brand-supplied artwork, never a page render, so
 * they don't carry banners (and we no longer use page captures in the automatic job).
 */
export const MIN_W = 600;
export const MIN_H = 300;
export const MIN_COLOR_BUCKETS = 8;
export const MAX_DOMINANT = 0.8;
/** Soft gradients spread over many tiny buckets: that much variety is a photo, not a logo. */
export const MIN_DISTINCT_BUCKETS = 60;

export interface ImageVerdict {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
  colorBuckets?: number;
  dominant?: number;
}

export async function assessHeroImage(buf: Buffer): Promise<ImageVerdict> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default as unknown as typeof import("sharp");
  } catch {
    return { ok: false, reason: "image analyzer unavailable" };
  }
  try {
    const meta = await sharp(buf).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < MIN_W || height < MIN_H) return { ok: false, reason: `too small (${width}×${height})`, width, height };
    const ratio = width / height;
    if (ratio < 1 || ratio > 2.6) return { ok: false, reason: `odd aspect ratio (${ratio.toFixed(2)})`, width, height };

    const { data } = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize(48, 48, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const counts = new Map<number, number>();
    const px = data.length / 3;
    for (let i = 0; i < data.length; i += 3) {
      const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = [...counts.values()].sort((a, b) => b - a);
    const dominant = sorted[0] / px;
    const colorBuckets = sorted.filter((c) => c / px >= 0.01).length;
    if (dominant > MAX_DOMINANT) return { ok: false, reason: `flat/logo (one colour covers ${Math.round(dominant * 100)}%)`, width, height, colorBuckets, dominant };
    if (colorBuckets < MIN_COLOR_BUCKETS && counts.size < MIN_DISTINCT_BUCKETS) return { ok: false, reason: `flat/logo (${colorBuckets} significant colours)`, width, height, colorBuckets, dominant };
    return { ok: true, width, height, colorBuckets, dominant };
  } catch (e) {
    return { ok: false, reason: `unreadable image: ${(e as Error).message}` };
  }
}
