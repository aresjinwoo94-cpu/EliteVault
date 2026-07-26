/**
 * SEO env guard — fails LOUDLY when NEXT_PUBLIC_APP_URL is missing or not a
 * production https URL.
 *
 * Why this exists: app/layout.tsx builds `metadataBase` from
 *   new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
 * and app/sitemap.ts / robots.ts derive every canonical, OG and sitemap URL
 * from the same env. If that var is unset (or left at localhost) in a
 * production build, EVERY canonical/OG/sitemap URL silently points at
 * localhost and Google can't index the site — the exact "only the home is
 * indexed" symptom. A build that ships with localhost canonicals is a
 * shipping bug, so we make it a hard, noisy failure instead.
 *
 * Usage:
 *   node scripts/check-seo-env.mjs           # checks process.env
 *   NODE_ENV=production node scripts/check-seo-env.mjs
 *
 * Behaviour:
 *   • NODE_ENV=production  → invalid/missing value exits 1 (breaks the build).
 *   • otherwise            → prints a warning but exits 0 (local dev is fine).
 */

const raw = process.env.NEXT_PUBLIC_APP_URL;
const isProd = process.env.NODE_ENV === "production";

function fail(msg) {
  console.error(`\n❌  [check-seo-env] ${msg}\n`);
  if (isProd) process.exit(1);
  console.warn("   (non-production: continuing, but fix this before deploy)\n");
}

if (!raw) {
  fail(
    "NEXT_PUBLIC_APP_URL is not set. In production it MUST be the apex https " +
      "URL, e.g. https://elitevaultapp.com — otherwise all canonicals/OG/" +
      "sitemap URLs fall back to http://localhost:3000 and the site won't index.",
  );
} else {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`NEXT_PUBLIC_APP_URL="${raw}" is not a valid URL.`);
    url = null;
  }

  if (url) {
    if (isProd && url.protocol !== "https:") {
      fail(
        `NEXT_PUBLIC_APP_URL="${raw}" must use https in production (got ${url.protocol}).`,
      );
    } else if (isProd && /localhost|127\.0\.0\.1/.test(url.hostname)) {
      fail(
        `NEXT_PUBLIC_APP_URL="${raw}" still points at localhost in production. ` +
          "Set it to https://elitevaultapp.com in Vercel.",
      );
    } else {
      console.log(`✅  [check-seo-env] NEXT_PUBLIC_APP_URL = ${raw}`);
    }
  }
}
