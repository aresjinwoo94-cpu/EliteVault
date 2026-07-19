/**
 * Library thumbnail snapshotter.
 *
 * Usage:
 *   npm run library:thumbs -- --dry-run        # show what would change
 *   npm run library:thumbs                     # snapshot everything missing
 *   npm run library:thumbs -- --limit 10       # do it in batches
 *   npm run library:thumbs -- --force          # re-snapshot even migrated rows
 *   npm run library:thumbs -- --only a.com,b.com   # restrict to these domains
 *                                              # (quota-rationing: pair with --force)
 *
 * # Why this exists
 * `winning_sites.thumbnail_url` used to hold a LIVE WordPress-mshots URL
 * (`https://s.wordpress.com/mshots/v1/<url>`). That made every Library card
 * depend, at render time, on a third-party service re-rendering someone else's
 * site. mshots generates on demand: a cold cache returns a blank placeholder —
 * which is exactly why cards showed up empty/grey. It also meant a winning
 * store could redesign (or block bots) and silently break our Library.
 *
 * These are WINNING stores: the snapshot is the artifact worth keeping. It
 * going stale is fine — actually preferable to it going blank. So we capture
 * each store ONCE and serve it from our own Supabase Storage. After this runs,
 * the Library renders entirely from our bucket and never touches the live
 * stores again.
 *
 * Idempotent: rows already pointing at our storage are skipped unless --force.
 * A capture failure leaves the existing URL untouched and moves on, so the
 * script is safe to re-run until every row is migrated.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);
for (const [k, v] of Object.entries(env)) process.env[k] = v;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf("--only");
const only =
  onlyIdx !== -1
    ? new Set(
        args[onlyIdx + 1]
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;

/**
 * Hard requirement: this script captures via ScreenshotOne ONLY (see the import
 * below). Without the key there is no capture path at all, so fail fast with the
 * instructions instead of 62 identical errors. Free tier is 100 shots/month with
 * no credit card — enough to backfill this whole library in one pass.
 */
if (!dryRun && !process.env.SCREENSHOTONE_ACCESS_KEY) {
  console.error(
    [
      "✗ SCREENSHOTONE_ACCESS_KEY is not set.",
      "",
      "  This script captures via ScreenshotOne only — on purpose. The fallback",
      "  chain (Microlink → mshots) returns BLANK placeholders on a cold cache,",
      "  and snapshotting those would freeze blank images into storage forever.",
      "",
      "  Get a free key (100/month, no credit card): https://screenshotone.com",
      "  Then set SCREENSHOTONE_ACCESS_KEY in .env.local and re-run.",
    ].join("\n"),
  );
  process.exit(1);
}

/** Bucket reused from the analyzer (already public); library shots get a prefix. */
const BUCKET = "screenshots";
const PREFIX = "library";
/** Be polite to the free screenshot providers between captures. */
const DELAY_MS = 1_500;

// Import the CORE module, not "@/lib/screenshot": the latter carries a
// `server-only` guard that Next resolves internally and plain tsx cannot.
//
// Deliberately the STRICT single-provider capture, not `captureScreenshot`:
// the full chain degrades to Microlink → mshots, and an mshots placeholder
// written into storage is permanent. A store ScreenshotOne can't reach (some
// bot-block it) must be SKIPPED, keeping its old URL and rendering the card's
// branded fallback tile — never a blank image frozen into our bucket.
const { captureWithScreenshotOne: captureScreenshot, flipWww } = await import(
  "../lib/screenshot-core"
);
const { createClient } = await import("@supabase/supabase-js");

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/**
 * Capture with two cheap retries that measurably lift the hit rate:
 *
 *  1. A generous timeout. The live-audit default (30s) is too tight for big
 *     DTC homepages at full_page — bombas.com times out at 30s yet returns a
 *     2.3MB shot given ~60s. Offline, we can afford to wait.
 *  2. The flipped-www host. Some stores answer non-2xx on one host and 200 on
 *     the other (www.burrow.com → 500, burrow.com → 200 · 3.6MB), so a single
 *     recorded URL silently loses a perfectly capturable store.
 *
 * Anything still failing after both is genuinely bot-blocking us (verified:
 * bearaby / brooklinen / allbirds refuse every host + param combination) and
 * needs residential proxies — out of scope on the free tier.
 */
const TIMEOUT_MS = 60_000;

/**
 * Thumbnail geometry, NOT audit geometry. These are cards, not audits: the
 * SiteCard shows a 4:3 window a few hundred px wide. A full-page @2x capture
 * is ~2880x20000 and 1-4MB — the card can only ever show a sliver of it, and
 * 53 of them is ~124MB of library page weight. One viewport at 1x is the hero
 * shot the card actually wants, at ~200-400KB.
 */
const SHOT_OPTS = {
  timeoutMs: TIMEOUT_MS,
  fullPage: false,
  deviceScaleFactor: 1,
  // Cards want the hero, not a newsletter modal (bearaby/daily-harvest
  // came back as a blank overlay without this).
  blockBannersByHeuristics: true,
} as const;

async function capture(url: string) {
  try {
    return await captureScreenshot(url, SHOT_OPTS);
  } catch (err) {
    const alt = flipWww(url);
    if (!alt) throw err;
    try {
      return await captureScreenshot(alt, SHOT_OPTS);
    } catch {
      // Report the ORIGINAL host's failure, not the flipped one's. The flip is
      // a speculative long-shot — when the alternate host simply doesn't exist
      // its error (a bare 400) is noise that masks why the real URL failed.
      throw err;
    }
  }
}

/** True once thumbnail_url points at our own storage (i.e. already migrated). */
function isSelfHosted(url: string | null): boolean {
  if (!url) return false;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return Boolean(base) && url.startsWith(base);
}

const { data: rows, error } = await svc
  .from("winning_sites")
  .select("id, url, domain, thumbnail_url")
  .order("domain");

if (error) {
  console.error("Failed to read winning_sites:", error.message);
  process.exit(1);
}

const sites = (rows ?? []) as {
  id: string;
  url: string;
  domain: string;
  thumbnail_url: string | null;
}[];

// Count BEFORE applying --limit, otherwise the "already self-hosted" tally
// silently absorbs the rows the limit skipped.
const scoped = only
  ? sites.filter((s) => only.has(s.domain.toLowerCase()))
  : sites;
if (only && scoped.length < only.size) {
  const found = new Set(scoped.map((s) => s.domain.toLowerCase()));
  for (const d of only)
    if (!found.has(d)) console.warn(`--only: domain not in winning_sites: ${d}`);
}
const pending = scoped.filter((s) => force || !isSelfHosted(s.thumbnail_url));
const todo = pending.slice(0, limit);

console.log(
  `${sites.length} sites total · ${sites.length - pending.length} already self-hosted · ${pending.length} pending${
    todo.length < pending.length ? ` · ${todo.length} this run (--limit)` : ""
  }${dryRun ? "  (DRY RUN — nothing will be written)" : ""}\n`,
);

if (todo.length === 0) {
  console.log("Nothing to do. Every thumbnail is already self-hosted. ✓");
  process.exit(0);
}

let ok = 0;
let failed = 0;

for (const [i, site] of todo.entries()) {
  const label = `[${i + 1}/${todo.length}] ${site.domain.padEnd(28)}`;

  if (dryRun) {
    console.log(`${label} would capture → ${BUCKET}/${PREFIX}/${site.id}.*`);
    continue;
  }

  try {
    const shot = await capture(site.url);
    const ext = shot.mediaType === "image/png" ? "png" : "jpg";
    // Timestamped path: a re-capture gets a NEW public URL, so the Supabase
    // CDN (and browsers) can't keep serving the stale cached image — an
    // upsert to the same path would look "unchanged" for up to an hour.
    const path = `${PREFIX}/${site.id}-${Date.now()}.${ext}`;

    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(path, Buffer.from(shot.base64, "base64"), {
        contentType: shot.mediaType,
        upsert: true,
      });
    if (upErr) throw new Error(`upload: ${upErr.message}`);

    const {
      data: { publicUrl },
    } = svc.storage.from(BUCKET).getPublicUrl(path);

    const { error: updErr } = await svc
      .from("winning_sites")
      .update({ thumbnail_url: publicUrl })
      .eq("id", site.id);
    if (updErr) throw new Error(`update: ${updErr.message}`);

    // The row now points at the new object — delete the superseded one so
    // storage doesn't accumulate a dead multi-MB capture per re-run.
    if (isSelfHosted(site.thumbnail_url)) {
      const oldPath = site.thumbnail_url!.split(
        `/storage/v1/object/public/${BUCKET}/`,
      )[1];
      if (oldPath && oldPath !== path) {
        const { error: rmErr } = await svc.storage
          .from(BUCKET)
          .remove([decodeURIComponent(oldPath)]);
        if (rmErr) console.warn(`${label} (old object not removed: ${rmErr.message})`);
      }
    }

    console.log(`${label} ✓ ${publicUrl}`);
    ok++;
  } catch (err) {
    // Leave the old URL in place — a stale thumbnail beats a broken one, and
    // the row stays in the todo list for the next run.
    console.error(`${label} ✗ ${(err as Error).message}`);
    failed++;
  }

  await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(
  `\nDone. ${ok} snapshotted, ${failed} failed${failed ? " (re-run to retry them)" : ""}.`,
);
