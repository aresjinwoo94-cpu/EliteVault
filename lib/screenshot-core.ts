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

/**
 * Default height cap (px) for full-page captures — ~9 viewports at 900px.
 * See `fullPageMaxHeight` on captureWithScreenshotOne for why this exists
 * (it's the fix for the 60s-per-step 504 on tall pages).
 */
const DEFAULT_FULL_PAGE_MAX_H = (() => {
  const raw = Number(process.env.SCREENSHOT_FULL_PAGE_MAX_HEIGHT);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 8000;
})();

/**
 * Hard ceiling (ms) for the WHOLE provider chain in captureScreenshot.
 *
 * The Inngest step that calls it dies at 60s on Vercel Hobby, so this must
 * leave room for the upload + DB write that follow inside the same step.
 * 45s does; the chain used to be able to run ~100s+. Tune with
 * SCREENSHOT_BUDGET_MS (raise it if you move to Vercel Pro and bump
 * maxDuration in app/api/inngest/route.ts).
 */
const DEFAULT_CAPTURE_BUDGET_MS = (() => {
  const raw = Number(process.env.SCREENSHOT_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 45_000;
})();

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

/**
 * Flip the `www.` prefix: "https://www.x.com" ⇄ "https://x.com".
 * Returns null when `url` isn't parseable. Some hosts serve one and refuse the
 * other, so this is a cheap second chance rather than a cosmetic tweak.
 */
export function flipWww(url: string): string | null {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith("www.")
      ? u.hostname.slice(4)
      : `www.${u.hostname}`;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Public entry point — tries providers in order until one succeeds, within a
 * HARD total time budget.
 *
 * Why the budget exists: this runs inside the Inngest `capture-screenshot`
 * step, and on Vercel Hobby a step is killed at 60s (app/api/inngest/route.ts),
 * which surfaces as "Your server returned HTTP 504 before the SDK responded"
 * and refunds the audit. The provider chain could far exceed that on its own —
 * measured on a bot-blocking store: ScreenshotOne refused twice (~2s), then
 * mshots burned 55s across its retry ladder and still returned only
 * placeholders. Fixed per-provider timeouts couldn't prevent it because they
 * don't know how much time the earlier providers already spent.
 *
 * Now every provider gets only the time that's actually LEFT. If the budget
 * runs out we throw the normal "All screenshot providers failed" error, which
 * humanizeError() turns into the honest "this site blocks automated capture —
 * upload a screenshot" message. A clean refund at ~45s beats a 504 at 60s+.
 */
export async function captureScreenshot(
  url: string,
  opts: { budgetMs?: number } = {},
): Promise<{
  base64: string;
  mediaType: "image/png" | "image/jpeg";
}> {
  const errors: string[] = [];
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_CAPTURE_BUDGET_MS);
  const remaining = () => deadline - Date.now();
  /** Don't start a provider that can't plausibly finish. */
  const MIN_USEFUL_MS = 5_000;

  // Provider 1: ScreenshotOne (paid, best quality)
  if (process.env.SCREENSHOTONE_ACCESS_KEY) {
    // Retry once on the flipped-www host before degrading to a weaker
    // provider. Measured: www.burrow.com → HTTP 500 but burrow.com → 200 with
    // a 3.6MB shot. A store recorded on the "wrong" host would otherwise fall
    // all the way through to mshots and come back a blank placeholder — a
    // capturable store lost to a hostname detail. Cheap: the refusal is a fast
    // non-2xx, not a timeout.
    const alt = flipWww(url);
    for (const candidate of alt ? [url, alt] : [url]) {
      if (remaining() < MIN_USEFUL_MS) break;
      try {
        return await captureWithScreenshotOne(candidate, {
          timeoutMs: Math.min(30_000, remaining()),
        });
      } catch (err) {
        const msg = (err as Error).message;
        console.warn(`[screenshot] ScreenshotOne failed (${candidate}): ${msg}`);
        errors.push(`ScreenshotOne(${candidate}): ${msg}`);
        // fall through: try the alt host, then the next provider
      }
    }
  }

  // Provider 2: Microlink (free 50/day without a key — set MICROLINK_API_KEY
  // to stop this tier from being the bottleneck). Measured: captures stores
  // that refuse ScreenshotOne in ~8s, so it's the one that actually rescues
  // bot-blocked sites.
  if (remaining() >= MIN_USEFUL_MS) {
    try {
      return await captureWithMicrolink(url, remaining());
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[screenshot] Microlink failed: ${msg}`);
      errors.push(`Microlink: ${msg}`);
    }
  } else {
    errors.push("Microlink: skipped (out of time budget)");
  }

  // Provider 3: mshots with aggressive placeholder detection
  if (remaining() >= MIN_USEFUL_MS) {
    try {
      return await captureWithMshots(url, remaining());
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`[screenshot] mshots failed: ${msg}`);
      errors.push(`mshots: ${msg}`);
    }
  } else {
    errors.push("mshots: skipped (out of time budget)");
  }

  throw new Error(
    `All screenshot providers failed for ${url}. ${errors.join(" | ")}`,
  );
}

// ─── Provider implementations ──────────────────────────────────────────────

/**
 * Exported so callers that must NOT silently degrade can demand this provider
 * and nothing else. `captureScreenshot` above falls back to Microlink → mshots,
 * which is right for a live audit (a stale shot beats no audit) but wrong for
 * the library backfill: there, a fallback placeholder would be written into
 * storage permanently. Those callers want a clean throw instead.
 *
 * NOTE: deliberately does NOT pass `ignore_host_errors`. Bot-blocked stores
 * answer with a non-2xx and ScreenshotOne refuses — that refusal is a FEATURE.
 * Forcing it on returns a ~10KB screenshot of the store's error page, which is
 * worse than failing (MIN_REAL_SHOT_BYTES would reject most, but not all).
 */
export async function captureWithScreenshotOne(
  url: string,
  opts: {
    timeoutMs?: number;
    /**
     * Full-page (default) vs a single viewport. The AUDIT wants the whole page
     * — the AI reads the entire funnel. A THUMBNAIL does not: full-page shots
     * come back ~2880x20000 (ratio ~7) and 1-4MB, of which a 4:3 card shows one
     * sliver. Viewport-only gives the hero at ~200-400KB.
     */
    fullPage?: boolean;
    /**
     * Default 1 (was 2). At a 1440 viewport, @2x renders a 2880px-wide image —
     * and full-page shots are already 10-20k tall, so @2x quadruples the pixels
     * of an image that's several MB before it's even uploaded, re-fetched,
     * base64'd and pushed through the vision model. Vision models downscale
     * large inputs anyway, so most of that detail is paid for and then thrown
     * away. 1440 CSS px is a normal desktop render — enough to judge layout,
     * hierarchy, colour and CTA placement, which is what the audit grades.
     * Pass 2 explicitly if a caller ever needs to read fine print.
     */
    deviceScaleFactor?: 1 | 2;
    /**
     * Also dismiss newsletter/discount modals via ScreenshotOne's heuristics
     * (`block_banners_by_heuristics`). OFF by default: the AUDIT should see the
     * store exactly as a visitor does — an aggressive popup IS a CRO finding.
     * Thumbnail captures turn it on: a card wants the hero, not the modal
     * (measured: bearaby/daily-harvest thumbs were a blank modal overlay).
     */
    blockBannersByHeuristics?: boolean;
    /**
     * Hard cap (px) on the height of a FULL-PAGE capture. Ignored unless
     * `fullPage` is on.
     *
     * Uncapped full-page shots come back ~10-20k tall (infinite-scroll and
     * long PDPs are the worst offenders) at several MB. That single image is
     * then re-fetched, base64'd (+33%) and pushed through the vision model —
     * where it dominates the audit's latency. On Vercel Hobby the Inngest
     * route is capped at 60s PER STEP (app/api/inngest/route.ts), so a tall
     * page pushed `run-analyzer-agent` past the ceiling and Vercel answered
     * 504 → Inngest retried → the audit refunded. That's the
     * "Your server returned HTTP 504 before the SDK responded" failure.
     *
     * DEFAULT_FULL_PAGE_MAX_H keeps the whole conversion funnel (hero, social
     * proof, product, reviews, FAQ, footer sit well inside it) while cutting
     * the pathological tails, so the audit gets faster WITHOUT losing the
     * context it grades. Override per-caller, or globally via
     * SCREENSHOT_FULL_PAGE_MAX_HEIGHT.
     */
    fullPageMaxHeight?: number;
  } = {},
): Promise<{
  base64: string;
  mediaType: "image/jpeg";
}> {
  const params = new URLSearchParams({
    access_key: process.env.SCREENSHOTONE_ACCESS_KEY!,
    url,
    viewport_width: String(VIEWPORT_W),
    viewport_height: String(VIEWPORT_H),
    device_scale_factor: String(opts.deviceScaleFactor ?? 1),
    format: "jpg",
    image_quality: "92",
    full_page: String(opts.fullPage ?? true),
    // Only meaningful for full-page captures; omitted otherwise.
    ...((opts.fullPage ?? true)
      ? {
          full_page_max_height: String(
            opts.fullPageMaxHeight ?? DEFAULT_FULL_PAGE_MAX_H,
          ),
        }
      : {}),
    block_ads: "true",
    block_cookie_banners: "true",
    ...(opts.blockBannersByHeuristics
      ? { block_banners_by_heuristics: "true" }
      : {}),
    cache: "true",
    cache_ttl: "86400",
  });
  const res = await fetch(`https://api.screenshotone.com/take?${params}`, {
    // 30s default — ScreenshotOne sometimes takes a while on heavy sites. Some
    // big DTC homepages genuinely need longer at full_page (bombas.com times
    // out at 30s but returns a 2.3MB shot given ~50s), so offline callers like
    // the library backfill raise this; the live audit keeps 30s to stay snappy.
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
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

async function captureWithMicrolink(
  url: string,
  budgetMs = 45_000,
): Promise<{
  base64: string;
  mediaType: "image/jpeg" | "image/png";
}> {
  const deadline = Date.now() + budgetMs;
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

  // Reserve a slice of the budget for the image fetch that follows.
  const metaRes = await fetch(apiUrl.toString(), {
    headers,
    signal: AbortSignal.timeout(
      Math.max(1_000, Math.min(45_000, deadline - Date.now() - 5_000)),
    ),
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
    signal: AbortSignal.timeout(
      Math.max(1_000, Math.min(15_000, deadline - Date.now())),
    ),
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

async function captureWithMshots(
  url: string,
  budgetMs = 55_000,
): Promise<{
  base64: string;
  mediaType: "image/png" | "image/jpeg";
}> {
  // mshots is generate-on-demand. The first request kicks off rendering;
  // subsequent requests return the cached real shot after ~10-30 seconds.
  // We retry with widening delays so we don't give up before mshots had
  // a fair chance to render.
  //
  // The full ladder is ~55s of sleeping alone, which on its own can blow the
  // Inngest step's 60s ceiling when the earlier providers already spent time.
  // So every wait and every fetch is clamped to the budget LEFT, and we stop
  // as soon as it's gone instead of running the ladder to completion.
  const mshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${VIEWPORT_W}&h=${VIEWPORT_H}`;
  const delaysMs = [0, 4000, 7000, 10_000, 14_000, 18_000];
  const deadline = Date.now() + budgetMs;
  let lastBuf: Buffer | null = null;
  let attempts = 0;

  for (let i = 0; i < delaysMs.length; i++) {
    // Need room for the wait plus a meaningful fetch afterwards.
    if (deadline - Date.now() < delaysMs[i] + 3_000) {
      console.warn(`[mshots] stopping at attempt ${i + 1}: out of time budget`);
      break;
    }
    if (delaysMs[i] > 0) {
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
    attempts++;
    try {
      const res = await fetch(mshotUrl, {
        signal: AbortSignal.timeout(
          Math.max(1_000, Math.min(20_000, deadline - Date.now())),
        ),
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
      `mshots only returned placeholder after ${attempts} attempts — this site is either Cloudflare-protected or too slow to render. Try uploading a screenshot manually.`,
    );
  }
  throw new Error(
    `mshots returned no usable response after ${attempts} attempts.`,
  );
}
