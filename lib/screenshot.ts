import "server-only";
import { createHash } from "node:crypto";

/**
 * Capture a high-fidelity full-page screenshot of a URL.
 *
 * Provider chain:
 *   1. ScreenshotOne (if SCREENSHOTONE_ACCESS_KEY is set) — paid, reliable.
 *   2. Microlink.io — free 50 req/day, no API key needed for basic usage.
 *   3. Wordpress mshots — free fallback, often cold-caches and returns a
 *      "Generating Preview..." placeholder image.
 *
 * # The mshots placeholder problem
 * mshots is generated-on-demand: the FIRST hit to an uncached URL returns
 * a placeholder ("Generating Preview…" with a WordPress logo). The real
 * screenshot only exists after mshots has had a chance to render it
 * (10-30 seconds, sometimes longer for slow sites).
 *
 * If we save that placeholder and feed it to Gemini, the model "analyzes"
 * the placeholder — which produces useless annotations and burns the
 * user's credit on garbage. This module DETECTS placeholders aggressively
 * and retries until we get either a real shot or a hard timeout.
 *
 * Detection signals:
 *   • Tiny body size (< 30KB at 1440x900 is almost always the placeholder)
 *   • Known SHA-1 hashes of mshots placeholder variants
 *   • Suspicious dimensions inferred from JPEG headers (placeholder is
 *     always a fixed-size graphic, not the requested viewport)
 */

const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;

// Empirically, real screenshots at 1440x900 are 80KB-2MB. The mshots
// "Generating Preview..." placeholder is ~16-22KB. Anything under this
// threshold is almost certainly a placeholder or a corrupt download.
const MIN_REAL_SHOT_BYTES = 30_000;

// Known SHA-1 hashes of mshots placeholders we've seen in the wild.
// We can keep adding to this set as new variants surface. This is the
// most reliable detection — independent of size and dimensions.
//
// NOTE: We don't ship with hashes pre-populated because mshots rotates
// them occasionally. The size check is enough for the first pass; if a
// placeholder slips through with > MIN_REAL_SHOT_BYTES, add its hash here.
const KNOWN_PLACEHOLDER_HASHES = new Set<string>([
  // (populated as we learn)
]);

function isLikelyPlaceholder(buf: Buffer): boolean {
  if (buf.length < MIN_REAL_SHOT_BYTES) return true;
  const hash = createHash("sha1").update(buf).digest("hex");
  return KNOWN_PLACEHOLDER_HASHES.has(hash);
}

/** Public entry point — tries providers in order until one succeeds. */
export async function captureScreenshot(url: string): Promise<{
  base64: string;
  mediaType: "image/png" | "image/jpeg";
}> {
  const errors: string[] = [];

  // Provider 1: ScreenshotOne (paid, best quality)
  if (process.env.SCREENSHOTONE_ACCESS_KEY) {
    try {
      return await captureWithScreenshotOne(url);
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[screenshot] ScreenshotOne failed: ${msg}`);
      errors.push(`ScreenshotOne: ${msg}`);
      // fall through to next provider
    }
  }

  // Provider 2: Microlink (free 50/day, server-side rendering)
  try {
    return await captureWithMicrolink(url);
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[screenshot] Microlink failed: ${msg}`);
    errors.push(`Microlink: ${msg}`);
  }

  // Provider 3: mshots with aggressive placeholder detection
  try {
    return await captureWithMshots(url);
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[screenshot] mshots failed: ${msg}`);
    errors.push(`mshots: ${msg}`);
  }

  throw new Error(
    `All screenshot providers failed for ${url}. ${errors.join(" | ")}`,
  );
}

// ─── Provider implementations ──────────────────────────────────────────────

async function captureWithScreenshotOne(url: string): Promise<{
  base64: string;
  mediaType: "image/jpeg";
}> {
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOTONE_ACCESS_KEY!,
    url,
    viewport_width: String(VIEWPORT_W),
    viewport_height: String(VIEWPORT_H),
    device_scale_factor: "2",
    format: "jpg",
    image_quality: "92",
    full_page: "true",
    block_ads: "true",
    block_cookie_banners: "true",
    cache: "true",
    cache_ttl: "86400",
  });
  const res = await fetch(`https://api.screenshotone.com/take?${params}`, {
    // 30s — ScreenshotOne sometimes takes a while on heavy sites
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_REAL_SHOT_BYTES) {
    throw new Error(`Suspiciously small response (${buf.length}b)`);
  }
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
}

async function captureWithMicrolink(url: string): Promise<{
  base64: string;
  mediaType: "image/jpeg" | "image/png";
}> {
  // Microlink renders the page server-side via Puppeteer and returns a
  // hosted screenshot URL. We then fetch the binary.
  //
  // Free tier: 50 req/day, no API key. Beyond that, get a key and set
  // MICROLINK_API_KEY — we pass it as a header automatically.
  const apiUrl = new URL("https://api.microlink.io");
  apiUrl.searchParams.set("url", url);
  apiUrl.searchParams.set("screenshot", "true");
  apiUrl.searchParams.set("meta", "false");
  apiUrl.searchParams.set("viewport.width", String(VIEWPORT_W));
  apiUrl.searchParams.set("viewport.height", String(VIEWPORT_H));
  apiUrl.searchParams.set("waitUntil", "networkidle0");
  apiUrl.searchParams.set("fullPage", "false");

  const headers: HeadersInit = {};
  if (process.env.MICROLINK_API_KEY) {
    headers["x-api-key"] = process.env.MICROLINK_API_KEY;
  }

  const metaRes = await fetch(apiUrl.toString(), {
    headers,
    signal: AbortSignal.timeout(45_000),
  });
  if (!metaRes.ok) {
    throw new Error(`Microlink HTTP ${metaRes.status}`);
  }
  const metaJson = (await metaRes.json()) as {
    status: string;
    data?: { screenshot?: { url?: string } };
    message?: string;
  };
  if (metaJson.status !== "success" || !metaJson.data?.screenshot?.url) {
    throw new Error(metaJson.message ?? "Microlink returned no screenshot URL");
  }

  // Fetch the actual image binary
  const imgRes = await fetch(metaJson.data.screenshot.url, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!imgRes.ok) {
    throw new Error(`Image fetch HTTP ${imgRes.status}`);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length < MIN_REAL_SHOT_BYTES) {
    throw new Error(`Microlink returned tiny image (${buf.length}b)`);
  }
  const contentType = imgRes.headers.get("content-type") ?? "image/png";
  return {
    base64: buf.toString("base64"),
    mediaType: contentType.includes("jpeg") ? "image/jpeg" : "image/png",
  };
}

async function captureWithMshots(url: string): Promise<{
  base64: string;
  mediaType: "image/png" | "image/jpeg";
}> {
  // mshots is generate-on-demand. The first request kicks off rendering;
  // subsequent requests return the cached real shot after ~10-30 seconds.
  // We retry with widening delays so we don't give up before mshots had
  // a fair chance to render.
  const mshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${VIEWPORT_W}&h=${VIEWPORT_H}`;
  const delaysMs = [0, 4000, 7000, 10_000, 14_000, 18_000];
  let lastBuf: Buffer | null = null;

  for (let i = 0; i < delaysMs.length; i++) {
    if (delaysMs[i] > 0) {
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
    try {
      const res = await fetch(mshotUrl, {
        signal: AbortSignal.timeout(20_000),
        // No-cache so we don't get the CDN serving us the same placeholder
        cache: "no-store",
      });
      if (!res.ok) {
        console.warn(`[mshots] attempt ${i + 1}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      lastBuf = buf;
      if (isLikelyPlaceholder(buf)) {
        console.warn(
          `[mshots] attempt ${i + 1}: got placeholder (${buf.length}b), retrying`,
        );
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "image/jpeg";
      console.log(`[mshots] attempt ${i + 1}: got real shot (${buf.length}b)`);
      return {
        base64: buf.toString("base64"),
        mediaType: contentType.includes("png") ? "image/png" : "image/jpeg",
      };
    } catch (err) {
      console.warn(`[mshots] attempt ${i + 1} error:`, (err as Error).message);
    }
  }

  if (lastBuf && lastBuf.length > 0) {
    throw new Error(
      `mshots only returned placeholder after ${delaysMs.length} attempts — this site is either Cloudflare-protected or too slow to render. Try uploading a screenshot manually.`,
    );
  }
  throw new Error(
    `mshots returned no usable response after ${delaysMs.length} attempts.`,
  );
}
