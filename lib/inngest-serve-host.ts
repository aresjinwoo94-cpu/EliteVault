/**
 * The host Inngest should call back for every step, in PRODUCTION only.
 *
 * Without it, Inngest stores whatever URL a sync arrived on — on Vercel that is
 * the deploy's UNIQUE url (elite-vault-<hash>.vercel.app). If a later sync
 * fails, Inngest stays pinned to that old deploy and keeps running its code
 * while the website moves on. Measured 2026-10-01: the site served 624d27c
 * (PR #69) while every `POST /api/inngest` still went to the 2026-09-03 deploy
 * (a27321e), so a month of pipeline fixes had never run in production
 * (docs/analyzer-speed-fix-free-tier.md §1).
 *
 * Pinning the stable domain (INNGEST_SERVE_HOST=https://elitevaultapp.com) makes
 * every sync register a URL that always points at the latest production deploy.
 *
 * Preview and local return undefined: they keep the SDK's default (the URL the
 * request came in on), so a preview deploy can never hijack production's
 * callbacks. NOTE: the SDK ALSO reads INNGEST_SERVE_HOST from the environment
 * on its own when this returns undefined, so the variable must be scoped to
 * Production in Vercel — this guard covers the code path, the scope covers the
 * SDK's own fallback.
 *
 * Fails closed: anything that isn't an absolute http(s) URL is ignored rather
 * than handed to the SDK, which would build broken callback URLs from it.
 */
export function resolveInngestServeHost(
  env: Record<string, string | undefined>,
): string | undefined {
  if (env.VERCEL_ENV !== "production") return undefined;
  const raw = env.INNGEST_SERVE_HOST?.trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.origin;
  } catch {
    return undefined;
  }
}
