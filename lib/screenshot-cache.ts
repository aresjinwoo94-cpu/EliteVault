import "server-only";
import type { createSupabaseServiceClient } from "@/lib/supabase/server";
import { urlHash } from "@/lib/image-hash";

/**
 * P1.4 — screenshot cache keyed by URL hash.
 *
 * Re-analyzing the same store shouldn't re-run the slow capture providers
 * (ScreenshotOne → Microlink → mshots, 10-30s). We store the public
 * screenshot URL of the first successful capture and re-download it on
 * subsequent runs. If the stored object was deleted the URL 404s and the
 * caller falls back to a fresh capture (self-healing).
 *
 * All access is service-role only (RLS has no public policies). We cast to
 * `any` because the hand-written Supabase Database type doesn't include
 * this v4 table yet (same known gap documented in next.config.mjs).
 */

type Service = ReturnType<typeof createSupabaseServiceClient>;

export interface CachedShot {
  screenshot_url: string;
  media_type: "image/png" | "image/jpeg";
}

export async function readScreenshotCache(
  service: Service,
  url: string,
): Promise<CachedShot | null> {
  try {
    const { data } = await (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.from("screenshot_cache") as any
    )
      .select("screenshot_url, media_type")
      .eq("url_hash", urlHash(url))
      .maybeSingle();
    if (!data?.screenshot_url) return null;
    return {
      screenshot_url: data.screenshot_url as string,
      media_type:
        data.media_type === "image/png" ? "image/png" : "image/jpeg",
    };
  } catch {
    return null;
  }
}

export async function writeScreenshotCache(
  service: Service,
  url: string,
  screenshotUrl: string,
  mediaType: "image/png" | "image/jpeg",
): Promise<void> {
  try {
    await (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.from("screenshot_cache") as any
    ).upsert(
      {
        url_hash: urlHash(url),
        url,
        screenshot_url: screenshotUrl,
        media_type: mediaType,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "url_hash" },
    );
  } catch {
    /* cache write is best-effort — never fail the audit over it */
  }
}
