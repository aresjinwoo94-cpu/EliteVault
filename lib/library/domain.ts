/**
 * The single URL/domain normalizer for the Library.
 *
 * Every writer (discovery agent, curated seeds, backfill jobs) must funnel
 * through here before touching `winning_sites`, and the value it produces is
 * what the `winning_sites_domain_key_uidx` unique index enforces. That pairing
 * — one function + one constraint — is what makes upserts idempotent and
 * duplicates impossible, which is the whole credibility argument for the
 * Library.
 *
 * The SQL in supabase/migrations/0017_library_expansion.sql backfills
 * `domain_key` with the same rules. If you change one, change the other.
 *
 * NOTE: deliberately free of `server-only` and of any Supabase import so the
 * CLI jobs (tsx) and the app can share it.
 */

/**
 * Canonical key for a store: lowercase host, no protocol, no `www.`, no port,
 * no path/query/hash, no trailing dot. Returns null for anything that isn't a
 * usable host (empty, IP-only garbage, no dot).
 *
 *   "HTTPS://WWW.Foo.com/collections/all?x=1" → "foo.com"
 *   "foo.com."                                → "foo.com"
 *   "not a domain"                            → null
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocol
  s = s.replace(/^[^@/]*@/, ""); // userinfo
  s = s.replace(/[/?#].*$/, ""); // path / query / fragment
  s = s.replace(/:\d+$/, ""); // port
  s = s.replace(/^www\./, "");
  s = s.replace(/\.+$/, ""); // trailing dot(s)

  // A host we can actually link to: at least one dot, only host-safe chars,
  // and a plausible TLD. Anything else is bad input we refuse to store.
  if (!/^[a-z0-9.-]+$/.test(s)) return null;
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s)) return null;
  return s;
}

/**
 * Canonical https URL for a store, built from the normalized domain so the
 * stored `url` and `domain` can never disagree. Returns null when the input
 * doesn't normalize.
 */
export function canonicalUrl(input: string | null | undefined): string | null {
  const domain = normalizeDomain(input);
  return domain ? `https://${domain}` : null;
}

/** Public favicon for a domain (no user data leaves with the request). */
export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/**
 * Public Meta Ad Library search for everything a domain/brand is running.
 *
 * This is the plain public web UI, not the Graph API — no token, no scraping,
 * nothing fetched by us. We only hand the user a deep link, which is exactly
 * what the media buyer wants: the live creatives, not a number.
 */
export function metaAdLibraryUrl(query: string, country = "ALL"): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country,
    media_type: "all",
    q: query,
    search_type: "keyword_unordered",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}
