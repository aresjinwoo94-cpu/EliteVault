import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { isRealThumbnail, isProtectedThumbnail } from "../../lib/library/thumbnail";
import { judgeStore, type StoreFacts } from "../../lib/library/quality";
import { GOOD_EVIDENCE } from "./helpers/evidence";
import { imageSavePatch } from "../../lib/library/images";

/** WP-L1 (brief oct-2026 §L.3): a store without a REAL image is never published, owner images are sacred. */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const OWN = "https://x.supabase.co/storage/v1/object/public/screenshots/library/a.jpg";

test("only a real http(s) image counts: null, '', mshots, junk do not", () => {
  assert.equal(isRealThumbnail(OWN), true);
  assert.equal(isRealThumbnail("https://cdn.shopify.com/s/files/hero.jpg"), true);
  for (const bad of [null, undefined, "", "  ", "/relative.jpg", "data:image/png;base64,AAA", "https://s.wordpress.com/mshots/v1/https%3A%2F%2Ffoo.com?w=800&h=560"])
    assert.equal(isRealThumbnail(bad as string | null), false, String(bad));
  assert.equal(isProtectedThumbnail({ thumbnail_source: "owner" }), true);
  assert.equal(isProtectedThumbnail({ thumbnail_source: "capture" }), false);
  assert.equal(isProtectedThumbnail({}), false);
});

const good: StoreFacts = { url: "https://foo.com", domain: "foo.com", title: "Foo", niche: "skincare", isLive: true, thumbnailUrl: OWN, evidence: GOOD_EVIDENCE, activeAdsCount: null, internalScore: null };

test("the publication gate never publishes a store without a real image", () => {
  assert.equal(judgeStore(good).status, "published");
  for (const thumbnailUrl of [null, undefined, "", "https://s.wordpress.com/mshots/v1/x?w=800"]) {
    const v = judgeStore({ ...good, thumbnailUrl });
    assert.equal(v.status, "review", String(thumbnailUrl));
    assert.ok(v.reasons.includes("no real image"));
  }
});

const parked = { url: "https://foo.com", domain: "foo.com", title: "Foo", niche: "skincare", status: "review", is_live: true, review_reason: "no_image", active_ads_count: null, internal_score: null, store_checks: GOOD_EVIDENCE };

test("a row parked for lack of image republishes itself once it has one and passes the gate", () => {
  const { patch, publish } = imageSavePatch(parked, OWN, "capture");
  assert.equal(publish, true);
  assert.deepEqual(patch, { thumbnail_url: OWN, thumbnail_source: "capture", status: "published", review_reason: null });
});

test("a row parked for ANOTHER reason (or not live) stays parked after getting an image", () => {
  const other = imageSavePatch({ ...parked, review_reason: "not_a_store" }, OWN, "og_image");
  assert.equal(other.publish, false);
  assert.equal(other.patch.status, undefined);
  assert.equal(other.patch.thumbnail_source, "og_image");
  const dead = imageSavePatch({ ...parked, is_live: false }, OWN, "capture");
  assert.equal(dead.publish, false);
  assert.equal(dead.patch.review_reason, "site not live", "the reason moves on from no_image");
});

test("migration 0040: coerces published→review without a real image, protects owner images, marks the 87", () => {
  const sql = read("supabase/migrations/0040_library_images.sql");
  assert.match(sql, /new\.status = 'published'/);
  assert.match(sql, /new\.status := 'review'/);
  assert.match(sql, /mshots/);
  assert.match(sql, /old\.thumbnail_source = 'owner'/);
  assert.match(sql, /set thumbnail_source = 'owner'/);
  assert.match(sql, /alter column thumbnail_url drop not null/);
  assert.match(sql, /before insert or update on public\.winning_sites/);
});

test("no script or job writes an mshots placeholder into winning_sites any more", () => {
  const files = ["scripts/expand-library.ts", "scripts/library/discover.mts", "lib/library/refresh.ts", "lib/library/images.ts", "app/actions/library-images.ts"];
  for (const f of files) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /thumbnail_url:\s*`?https?:\/\/s\.wordpress\.com\/mshots/, f);
  }
  for (const f of ["scripts/expand-library.ts", "scripts/library/discover.mts"]) {
    assert.match(read(f), /thumbnail_url:\s*null/, `${f} inserts without an image`);
    assert.match(read(f), /review_reason:\s*"no_image"/);
  }
});

test("backfill and snapshot scripts skip owner images, even with --force", () => {
  for (const f of ["scripts/backfill-library-images.mts", "scripts/snapshot-library-thumbnails.mts"]) {
    const s = read(f);
    assert.match(s, /thumbnail_source !== "owner"/, f);
  }
  assert.doesNotMatch(read("scripts/backfill-library-images.mts"), /thumbnail_url: ""/);
});

test("the owner's manual upload marks the image 'owner'", () => {
  assert.match(read("app/actions/library-images.ts"), /thumbnail_source: "owner"/);
});

test("the image job is isolated: free providers only, concurrency 1, registered", () => {
  const lib = read("lib/library/images.ts");
  assert.match(lib, /captureViaOgImage/);
  assert.doesNotMatch(lib.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /captureScreenshot\(|captureWithScreenshotOne|captureWithThumIo|thum.io|Microlink/i);
  const fn = read("inngest/functions/fill-library-images.ts");
  assert.match(fn, /concurrency:\s*\{\s*limit:\s*1\s*\}/);
  assert.match(read("app/api/inngest/route.ts"), /fillLibraryImages/);
  // every writer of winning_sites in lib/ + scripts/ passes through the DB trigger; nothing else to enumerate
  assert.ok(readdirSync(join(ROOT, "supabase/migrations")).includes("0040_library_images.sql"));
});
