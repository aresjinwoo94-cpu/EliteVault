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

// Optional screenshot fallback (strict single provider — same as the snapshotter).
let captureScreenshot: ((url: string, opts: any) => Promise<{ base64: string; mediaType: string }>) | null = null;
let flipWww: ((u: string) => string | null) | null = null;
if (!ogOnly && process.env.SCREENSHOTONE_ACCESS_KEY) {
  const core = await import("../lib/screenshot-core");
  captureScreenshot = core.captureWithScreenshotOne as typeof captureScreenshot;
  flipWww = core.flipWww as typeof flipWww;
}
const SHOT_OPTS = { timeoutMs: 60000, fullPage: false, deviceScaleFactor: 1, blockBannersByHeuristics: true } as const;

async function screenshot(url: string): Promise<{ buf: Buffer; ext: string; contentType: string } | null> {
  if (!captureScreenshot) return null;
  const tryOne = async (u: string) => {
    const shot = await captureScreenshot!(u, SHOT_OPTS);
    const ext = shot.mediaType === "image/png" ? "png" : "jpg";
    return { buf: Buffer.from(shot.base64, "base64"), ext, contentType: shot.mediaType };
  };
  try {
    return await tryOne(url);
  } catch {
    const alt = flipWww?.(url);
    if (alt) {
      try {
        return await tryOne(alt);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
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
const pending = scoped.filter((s) => !isSelfHosted(s.thumbnail_url));
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
    const og = await findOgImage(home);
    console.log(`${label} ${og ? "og:image → " + og.slice(0, 70) : "no og:image (would try screenshot)"}`);
    continue;
  }

  try {
    // 1) og:image / twitter:image
    let img: { buf: Buffer; ext: string; contentType: string } | null = null;
    const og = await findOgImage(home);
    if (og) img = await downloadImage(og);
    let via = og && img ? "og:image" : "";

    // 2) screenshot fallback
    if (!img) {
      img = await screenshot(site.url);
      if (img) via = "screenshot";
    }

    if (!img) {
      failures.push(site.domain);
      console.error(`${label} ✗ no og:image, no screenshot — needs manual upload`);
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
