/**
 * v3.6.1 — Cloudflare-aware library cleanup.
 *
 * The old verify-thumbnails.mjs only checks file size (>=40KB). That
 * catches mshots "generating preview" placeholders BUT it MISSES sites
 * where Cloudflare blocks the screenshot bot and mshots captures the
 * "Sorry, you have been blocked" Cloudflare error page — that page is
 * a normal-sized image, just useless content (see Veja in the bug report).
 *
 * This script catches those by hitting the actual store URL with a
 * browser User-Agent and looking for:
 *   • HTTP 403 + cf-ray header / cf-* cookies (Cloudflare bot block)
 *   • Response body containing "Sorry, you have been blocked",
 *     "Just a moment", "Checking your browser", "Cloudflare Ray ID"
 *   • Status 503 with cf-mitigated header (rate limit / challenge)
 *
 * Sites flagged this way will, even if their thumbnail is technically
 * an image, only ever show the block page to users. Better to remove
 * them so the library only contains stores with real, viewable thumbs.
 *
 * Usage:
 *   node scripts/clean-blocked-library.mjs           # dry run, report only
 *   node scripts/clean-blocked-library.mjs --delete  # actually delete
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);
const svc = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const DELETE = process.argv.includes("--delete");

// Realistic browser User-Agent. Some Cloudflare-protected sites WILL still
// 403 us because they fingerprint TLS / JA3 / etc — that's fine, we treat
// any 403 with cf-* headers as blocked.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const CF_BLOCK_PATTERNS = [
  /sorry,?\s+you\s+have\s+been\s+blocked/i,
  /cloudflare\s+ray\s+id/i,
  /just\s+a\s+moment/i,
  /checking\s+your\s+browser/i,
  /attention\s+required/i,
  /access\s+denied.*cloudflare/i,
];

async function isCloudflareBlocked(siteUrl) {
  try {
    const res = await fetch(siteUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const serverHeader = (res.headers.get("server") ?? "").toLowerCase();
    const cfRay = res.headers.get("cf-ray");
    const cfMitigated = res.headers.get("cf-mitigated");

    // Strong signal: 403/503 from a Cloudflare-fronted origin
    if (
      (res.status === 403 || res.status === 503) &&
      (serverHeader.includes("cloudflare") || cfRay || cfMitigated)
    ) {
      return { blocked: true, reason: `HTTP ${res.status} (Cloudflare)` };
    }

    // Even a 200 can be a CF challenge page (interstitial). Sniff body.
    if (res.status === 200 || res.status === 503) {
      const text = await res.text();
      // Only inspect the first 8KB — challenge pages are tiny, we don't need
      // to download megabytes of HTML to detect them.
      const head = text.slice(0, 8192);
      for (const pat of CF_BLOCK_PATTERNS) {
        if (pat.test(head)) {
          return { blocked: true, reason: `challenge page (${pat.source.slice(0, 30)}…)` };
        }
      }
    }

    // 4xx / 5xx without CF marker — site just dead or 404. Treat as bad.
    if (res.status >= 400) {
      return { blocked: true, reason: `HTTP ${res.status}` };
    }

    return { blocked: false, reason: `${res.status} ok` };
  } catch (err) {
    // Network error / DNS / timeout — site unreachable, treat as bad.
    return { blocked: true, reason: `unreachable: ${err.message.slice(0, 60)}` };
  }
}

// Also check that the mshots thumbnail is a real image of reasonable size.
// (Same bar as verify-thumbnails: >=40KB.)
async function thumbnailLooksReal(thumbUrl) {
  try {
    const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const ctype = res.headers.get("content-type") ?? "";
    return buf.length >= 40000 && ctype.startsWith("image/");
  } catch {
    return false;
  }
}

const { data: sites } = await svc
  .from("winning_sites")
  .select("id, domain, url, thumbnail_url, is_featured")
  .order("domain");

if (!sites || sites.length === 0) {
  console.log("No sites in library.");
  process.exit(0);
}

console.log(
  `\nChecking ${sites.length} sites for Cloudflare blocks + dead thumbs…\n`,
);

const dead = [];
let okCount = 0;

for (const s of sites) {
  // Run both checks in parallel for speed
  const [cf, thumb] = await Promise.all([
    isCloudflareBlocked(s.url),
    thumbnailLooksReal(s.thumbnail_url),
  ]);

  let status = "ok";
  let reason = "";
  if (cf.blocked) {
    status = "blocked";
    reason = cf.reason;
  } else if (!thumb) {
    status = "thumb";
    reason = "thumbnail < 40KB or not an image";
  }

  const symbol = status === "ok" ? "✓" : "✗";
  const star = s.is_featured ? "★" : " ";
  const reasonPad = reason ? ` — ${reason}` : "";
  console.log(`  ${symbol} ${star} ${s.domain.padEnd(32)} ${status}${reasonPad}`);

  if (status === "ok") okCount++;
  else dead.push({ ...s, status, reason });
}

console.log(`\n${"─".repeat(60)}`);
console.log(`OK: ${okCount}    Dead: ${dead.length}`);
if (dead.length > 0) {
  const byReason = dead.reduce((acc, d) => {
    const key = d.status;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.log("  Breakdown:", JSON.stringify(byReason));
}

if (DELETE && dead.length > 0) {
  console.log(`\nDeleting ${dead.length} bad rows…`);
  const ids = dead.map((d) => d.id);
  const { error } = await svc.from("winning_sites").delete().in("id", ids);
  if (error) {
    console.error("✗ Delete failed:", error.message);
    process.exit(1);
  }
  console.log("✓ Cleaned.");
} else if (dead.length > 0) {
  console.log("\nRun with --delete to remove these rows.");
}
