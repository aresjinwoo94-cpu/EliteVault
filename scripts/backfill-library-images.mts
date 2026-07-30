/**
 * Library image backfill — makes every winning_sites row own a PERMANENT
 * thumbnail in our Supabase Storage, so no card ever falls back to a letter.
 *
 * Usage:
 *   npm run library:backfill -- --dry-run     # show what would change
 *   npm run library:backfill                  # backfill everything missing
 *   npm run library:backfill -- --limit 5
 *   npm run library:backfill -- --only scotchporter.com,bevel.com
 *   npm run library:backfill -- --og-only     # skip the screenshot fallback
 *
 * # Strategy (landing-images-fix §2), in preference order, per store:
 *   1. og:image / twitter:image — fetch the store's HTML server-side, read the
 *      social share image, download it, upload to our bucket. Permanent, real,
 *      on-brand, and needs NO headless capture (why the old screenshot-only
 *      approach left these blank).
 *   2. Screenshot (ScreenshotOne, once) — only if there's no og:image.
 *   3. Give up for that store → it stays in the report for the admin uploader
 *      (§3). We NEVER re-capture at render time.
 *
 * Idempotent: rows already pointing at our storage are skipped; a failure
 * leaves the old URL untouched, so re-running only retries the stragglers.
 * Runs in the project env (needs SUPABASE_SERVICE_ROLE_KEY + network).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
for (const [k, v] of Object.entries(env)) process.env[k] = v;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ogOnly = args.includes("--og-only");
// --screenshot: skip og:image, capture a real homepage screenshot (used to
// REPLACE logo/dark/blank og:images with a proper store shot).
// --force: process rows even if already self-hosted (needed to re-capture).
const screenshotMode = args.includes("--screenshot");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf("--only");
const only =
  onlyIdx !== -1
    ? new Set(args[onlyIdx + 1].split(",").map((d) => d.trim().toLowerCase()).filter(Boolean))
    : null;

const BUCKET = "screenshots";
const PREFIX = "library";
const DELAY_MS = 1200;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;

/**
 * Reject BLANK captures (solid white/dark screenshots from a provider that
 * failed to render) — a size check isn't enough (a blank 22KB PNG passes).
 * A real store thumbnail has visual variance; a blank is near-uniform.
 */
async function isBlank(buf: Buffer): Promise<boolean> {
  try {
    const stats = await sharp(buf).stats();
    // Mean per-channel standard deviation across the image. Near-solid colours
    // (blank/error pages) sit well under ~10; real screenshots are far higher.
    const avgStdev =
      stats.channels.reduce((a, c) => a + c.stdev, 0) / (stats.channels.length || 1);
    return avgStdev < 10;
  } catch {
    return false; // if we can't analyze it, don't wrongly discard it
  }
}

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SUPA_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** A row is "done" once its thumbnail lives in our own storage. */
function isSelfHosted(url: string | null): boolean {
  return !!SUPA_BASE && !!url && url.startsWith(SUPA_BASE);
}

function extFromContentType(ct: string): string | null {
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("avif")) return "avif";
  return null; // svg/gif/unknown → not a good card thumbnail
}

async function fetchWithTimeout(url: string, ms: number, accept: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept },
    });
  } finally {
    clearTimeout(t);
  }
}

/** Pull og:image / twitter:image from a store's homepage HTML. */
async function findOgImage(homeUrl: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(homeUrl, 15000, "text/html,*/*");
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const html = (await res.text()).slice(0, 600_000); // enough to cover <head>
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/&amp;/g, "&").trim();
      try {
        return new URL(raw, homeUrl).toString(); // resolve relative → absolute
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

/** First product image from a Shopify store's public /products.json — a clean,
 *  real product shot, the best card thumbnail for an ecommerce store (beats a
 *  logo og:image, and needs no headless capture). */
async function findShopifyProductImage(domain: string): Promise<string | null> {
  const bare = domain.replace(/^www\./, "");
  for (const host of [bare, "www." + bare]) {
    try {
      const res = await fetchWithTimeout(
        `https://${host}/products.json?limit=8`,
        15000,
        "application/json",
      );
      if (!res.ok) continue;
      if (!(res.headers.get("content-type") || "").includes("json")) continue;
      const j = (await res.json()) as {
        products?: Array<{ images?: Array<{ src?: string }> }>;
      };
      for (const p of j.products || []) {
        const src = p.images?.[0]?.src;
        if (src) return src.replace(/&amp;/g, "&");
      }
    } catch {
      /* try next host */
    }
  }
  return null;
}

/** Download an image URL → {buffer, ext} if it's a real, non-trivial image. */
async function downloadImage(
  imgUrl: string,
): Promise<{ buf: Buffer; ext: string; contentType: string } | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(imgUrl, 20000, "image/*,*/*");
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const ext = extFromContentType(ct);
  if (!ext) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  // Guard against 1x1 tracking pixels / empty responses.
  if (buf.length < 3000) return null;
  // Guard against blank/solid-colour images (failed provider renders).
  if (await isBlank(buf)) return null;
  return { buf, ext, contentType: ct };
}

async function uploadAndSet(
  site: { id: string; domain: string; thumbnail_url: string | null },
  buf: Buffer,
  ext: string,
  contentType: string,
): Promise<string> {
  const path = `${PREFIX}/${site.id}-${Date.now()}.${ext}`;
  const { error: upErr } = await svc.storage
    .from(BUCKET)
    .upload(path, buf, { contentType, upsert: true });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const {
    data: { publicUrl },
  } = svc.storage.from(BUCKET).getPublicUrl(path);
  const { error: updErr } = await svc
    .from("winning_sites")
    .update({ thumbnail_url: publicUrl })
    .eq("id", site.id);
  if (updErr) throw new Error(`update: ${updErr.message}`);
  // Remove a superseded self-hosted object (mshots URLs aren't ours → skip).
  if (isSelfHosted(site.thumbnail_url)) {
    const oldPath = site.thumbnail_url!.split(`/storage/v1/object/public/${BUCKET}/`)[1];
    if (oldPath) await svc.storage.from(BUCKET).remove([decodeURIComponent(oldPath)]).catch(() => {});
  }
  return publicUrl;
}

/**
 * Crop a raster image (product photo / og:image) to the card's 4:3 window,
 * centered on the most salient region (the product). The SiteCard uses
 * `object-cover object-top`, which is right for tall full-page SCREENSHOTS but
 * wrong for a product-on-white shot (it would show the empty top margin). By
 * storing an already-4:3 image, the card shows the whole product. Screenshots
 * are left tall on purpose (their hero is at the top).
 */
async function toCard(buf: Buffer): Promise<{ buf: Buffer; ext: string; contentType: string }> {
  // `contain` on white shows the WHOLE product centered (catalog look), so the
  // card never crops into it. A little padding around it via `contain` +
  // extend keeps it from touching the edges.
  const out = await sharp(buf)
    .flatten({ background: "#ffffff" }) // composite transparency onto white
    // Center-crop to the card's 4:3 so the product fills the frame (the card's
    // object-top then shows it whole, since the stored image is already 4:3).
    .resize(1000, 750, { fit: "cover", position: "center", withoutEnlargement: false })
    .jpeg({ quality: 84 })
    .toBuffer();
  return { buf: out, ext: "jpg", contentType: "image/jpeg" };
}

/** No real image available → set thumbnail_url to '' so the card renders the
 *  branded placeholder, and delete the superseded (e.g. blank) storage object. */
async function clearImage(site: { id: string; thumbnail_url: string | null }): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc.from("winning_sites") as any).update({ thumbnail_url: "" }).eq("id", site.id);
  if (isSelfHosted(site.thumbnail_url)) {
    const oldPath = site.thumbnail_url!.split(`/storage/v1/object/public/${BUCKET}/`)[1];
    if (oldPath) await svc.storage.from(BUCKET).remove([decodeURIComponent(oldPath)]).catch(() => {});
  }
}

// Optional screenshot fallback (strict single provider — same as the snapshotter).
let captureScreenshot: ((url: string, opts: any) => Promise<{ base64: string; mediaType: string }>) | null = null;
let flipWww: ((u: string) => string | null) | null = null;
if (!ogOnly && process.env.SCREENSHOTONE_ACCESS_KEY) {
  const core = await import("../lib/screenshot-core");
  captureScreenshot = core.captureWithScreenshotOne as typeof captureScreenshot;
  flipWww = core.flipWww as typeof flipWww;
}
const SHOT_OPTS = { timeoutMs: 60000, fullPage: false, deviceScaleFactor: 1, blockBannersByHeuristics: true } as const;

/** Microlink screenshot — different infra than ScreenshotOne, so it captures
 *  several stores that bot-block ScreenshotOne (returns non-2xx there). */
async function microlinkShot(
  url: string,
): Promise<{ buf: Buffer; ext: string; contentType: string } | null> {
  try {
    const api = `https://api.microlink.io/?url=${encodeURIComponent(
      url,
    )}&screenshot=true&meta=false&viewport.width=1280&viewport.height=900&screenshot.type=jpeg&waitUntil=networkidle2`;
    const res = await fetchWithTimeout(api, 60000, "application/json");
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status?: string;
      data?: { screenshot?: { url?: string } };
    };
    const shotUrl = json?.data?.screenshot?.url;
    if (json.status !== "success" || !shotUrl) return null;
    return await downloadImage(shotUrl);
  } catch {
    return null;
  }
}

async function screenshot(url: string): Promise<{ buf: Buffer; ext: string; contentType: string } | null> {
  // 1) ScreenshotOne (+ flipped www host).
  if (captureScreenshot) {
    const tryOne = async (u: string) => {
      const shot = await captureScreenshot!(u, SHOT_OPTS);
      const buf = Buffer.from(shot.base64, "base64");
      if (await isBlank(buf)) throw new Error("blank capture");
      const ext = shot.mediaType === "image/png" ? "png" : "jpg";
      return { buf, ext, contentType: shot.mediaType };
    };
    try {
      return await tryOne(url);
    } catch {
      const alt = flipWww?.(url);
      if (alt) {
        try {
          return await tryOne(alt);
        } catch {
          /* fall through to Microlink */
        }
      }
    }
  }
  // 2) Microlink fallback (captures bot-blockers ScreenshotOne can't).
  return await microlinkShot(url);
}

// ── Run ─────────────────────────────────────────────────────────────────────
const { data: rows, error } = await svc
  .from("winning_sites")
  .select("id, url, domain, thumbnail_url")
  .order("niche");
if (error) {
  console.error("Failed to read winning_sites:", error.message);
  process.exit(1);
}
type Site = { id: string; url: string; domain: string; thumbnail_url: string | null };
const sites = (rows ?? []) as Site[];
const scoped = only ? sites.filter((s) => only.has(s.domain.toLowerCase())) : sites;
const pending = force ? scoped : scoped.filter((s) => !isSelfHosted(s.thumbnail_url));
const todo = pending.slice(0, limit);

console.log(
  `${sites.length} sites · ${sites.length - pending.length} already self-hosted · ${pending.length} missing${
    todo.length < pending.length ? ` · ${todo.length} this run (--limit)` : ""
  }${dryRun ? "  (DRY RUN)" : ""}\n`,
);
if (todo.length === 0) {
  console.log("Nothing to do — every thumbnail is already permanent. ✓");
  process.exit(0);
}

let ok = 0;
const failures: string[] = [];
for (const [i, site] of todo.entries()) {
  const label = `[${i + 1}/${todo.length}] ${site.domain.padEnd(22)}`;
  const home = `https://${site.domain.replace(/^www\./, "")}`;

  if (dryRun) {
    if (screenshotMode) {
      console.log(`${label} would capture homepage screenshot (og:image skipped)`);
    } else {
      const og = await findOgImage(home);
      console.log(`${label} ${og ? "og:image → " + og.slice(0, 70) : "no og:image (would try screenshot)"}`);
    }
    continue;
  }

  try {
    let img: { buf: Buffer; ext: string; contentType: string } | null = null;
    let via = "";

    if (!screenshotMode) {
      // 1) Shopify product image — the best card shot for an ecommerce store.
      const prod = await findShopifyProductImage(site.domain);
      if (prod) img = await downloadImage(prod);
      if (prod && img) { img = await toCard(img.buf); via = "product"; }

      // 2) og:image / twitter:image.
      if (!img) {
        const og = await findOgImage(home);
        if (og) img = await downloadImage(og);
        if (og && img) { img = await toCard(img.buf); via = "og:image"; }
      }
    }

    // 3) real homepage screenshot (ScreenshotOne → Microlink).
    if (!img) {
      img = await screenshot(site.url);
      if (img) via = "screenshot";
    }

    if (!img) {
      failures.push(site.domain);
      // If re-capturing (force) and the row currently holds a superseded/blank
      // self-hosted object, clear it to the branded placeholder rather than
      // leaving a blank frozen in.
      if (force && isSelfHosted(site.thumbnail_url)) {
        await clearImage(site);
        console.error(`${label} ✗ no real image — cleared to branded placeholder`);
      } else {
        console.error(`${label} ✗ no og:image, no screenshot — needs manual upload`);
      }
    } else {
      const publicUrl = await uploadAndSet(site, img.buf, img.ext, img.contentType);
      console.log(`${label} ✓ (${via}, ${Math.round(img.buf.length / 1024)}KB) ${publicUrl.slice(-40)}`);
      ok++;
    }
  } catch (err) {
    failures.push(site.domain);
    console.error(`${label} ✗ ${(err as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\nDone. ${ok} backfilled, ${failures.length} still missing.`);
if (failures.length) console.log("Still missing (use the admin uploader):\n  " + failures.join("\n  "));
