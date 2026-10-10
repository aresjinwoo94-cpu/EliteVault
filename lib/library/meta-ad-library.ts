/**
 * Meta Ad Library — free discovery + momentum source (FASE A.2 / A.4).
 *
 * Two very different surfaces, and it matters which one we use where:
 *
 *  • The PUBLIC WEB UI (`metaAdLibraryUrl` in lib/library/domain.ts) is just a
 *    deep link we hand the user. No request from us, no token, always works.
 *    That's what powers the "See their active ads →" button in the analyzer.
 *
 *  • The GRAPH API (`ads_archive`, this file) is what the JOBS use to count a
 *    brand's active ads. It needs a free Meta developer app + token, it is
 *    rate-limited, and its coverage is uneven: outside the EU, non-political
 *    ads are only returned for some advertisers/regions. So the count is
 *    treated as a BONUS signal, never a requirement: when it's unavailable we
 *    return null, the badge hides, and the row still publishes on its other
 *    signals.
 *
 * Non-negotiables enforced here:
 *   – This module is only ever called from a cron/CLI job. NOTHING in the user
 *     request path may import it (see lib/library/niche-winners.ts, which
 *     reads precomputed columns only).
 *   – Every failure resolves to null. It never throws at the caller.
 *   – Serial calls with a delay + timeout. No aggressive scraping, ToS-safe.
 */

const GRAPH_VERSION = "v21.0";
const ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive`;

/**
 * Default reach country set. The Ad Library API returns NON-political ads only for the EU/UK:
 * a query for ["US"] sees political/issue ads, so a normal store always counted 0/none. Override
 * with META_AD_LIBRARY_COUNTRIES (comma-separated ISO codes). A count therefore means "active ads
 * reaching these countries" — the UI says so.
 */
const EU_DEFAULT = ["DE", "FR", "ES", "IT", "NL"];
export function adLibraryCountries(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.META_AD_LIBRARY_COUNTRIES ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
  return list.length ? list : EU_DEFAULT;
}

function token(): string | null {
  const t = process.env.META_AD_LIBRARY_TOKEN?.trim();
  return t ? t : null;
}

/** True when the jobs can talk to the Graph API at all. */
export function metaApiConfigured(): boolean {
  return token() !== null;
}

async function getJson(
  url: string,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      // 400 = unsupported search for this account, 190 = bad token, 613 = rate
      // limit. All of them mean "no data", never "fail the job".
      console.warn(`[meta-ad-library] HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn(`[meta-ad-library] request failed: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface AdCountResult {
  /** Number of active ads counted, capped at `max`. Null = no data. */
  activeAds: number | null;
  /** Whether the cap was hit (i.e. "at least N"). */
  capped: boolean;
}

/**
 * Count a brand's currently-active ads.
 *
 * Paginates until `max` (default 200) so a monster advertiser doesn't turn one
 * store into a hundred requests. Returns null — not 0 — when we can't tell, so
 * the UI hides the badge instead of implying the brand stopped spending.
 */
export async function countActiveAds(
  query: string,
  opts: {
    countries?: string[];
    max?: number;
    timeoutMs?: number;
  } = {},
): Promise<AdCountResult> {
  const accessToken = token();
  const none: AdCountResult = { activeAds: null, capped: false };
  if (!accessToken || !query?.trim()) return none;

  const max = opts.max ?? 200;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const countries = opts.countries ?? adLibraryCountries();

  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: query.trim(),
    ad_reached_countries: JSON.stringify(countries),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    fields: "id",
    limit: "100",
  });

  let url = `${ENDPOINT}?${params.toString()}`;
  let counted = 0;

  for (let page = 0; page < 5; page++) {
    const json = await getJson(url, timeoutMs);
    // First page failing = no data at all. A later page failing still leaves a
    // usable partial count, so keep what we have.
    if (!json) return page === 0 ? none : { activeAds: counted, capped: true };

    const data = Array.isArray(json.data) ? json.data : [];
    counted += data.length;
    if (counted >= max) return { activeAds: max, capped: true };

    const next = (json.paging as { next?: string } | undefined)?.next;
    if (!next || data.length === 0) break;
    url = next;
  }

  return { activeAds: counted, capped: false };
}

export interface AdvertiserCandidate {
  /** Advertiser page name as Meta reports it. */
  name: string;
  /** Link domain seen on the creative, when present. */
  domain: string | null;
  /** How many of the sampled active ads belong to this advertiser. */
  ads: number;
}

/**
 * Discover advertisers running ads for a niche keyword — the "who is winning
 * RIGHT NOW" source. Returns advertisers sorted by ad volume.
 *
 * Empty array (never a throw) when the API is unconfigured or unhelpful; the
 * discovery job then falls back to curated seeds.
 */
export async function discoverAdvertisers(
  keyword: string,
  opts: { countries?: string[]; pages?: number; timeoutMs?: number } = {},
): Promise<AdvertiserCandidate[]> {
  const accessToken = token();
  if (!accessToken || !keyword?.trim()) return [];

  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: keyword.trim(),
    ad_reached_countries: JSON.stringify(opts.countries ?? adLibraryCountries()),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    fields: "page_name,ad_snapshot_url,ad_creative_link_captions",
    limit: "100",
  });

  let url = `${ENDPOINT}?${params.toString()}`;
  const byName = new Map<string, AdvertiserCandidate>();

  for (let page = 0; page < (opts.pages ?? 3); page++) {
    const json = await getJson(url, opts.timeoutMs ?? 20_000);
    if (!json) break;

    const rows = Array.isArray(json.data) ? json.data : [];
    for (const raw of rows) {
      const row = raw as {
        page_name?: string;
        ad_creative_link_captions?: string[];
      };
      const name = row.page_name?.trim();
      if (!name) continue;
      // The link caption is the display domain on the creative — the most
      // reliable free hint at the actual store URL.
      const caption = Array.isArray(row.ad_creative_link_captions)
        ? row.ad_creative_link_captions.find((c) => typeof c === "string" && c.includes("."))
        : null;
      const existing = byName.get(name);
      if (existing) {
        existing.ads++;
        existing.domain ??= caption ?? null;
      } else {
        byName.set(name, { name, domain: caption ?? null, ads: 1 });
      }
    }

    const next = (json.paging as { next?: string } | undefined)?.next;
    if (!next || rows.length === 0) break;
    url = next;
  }

  return [...byName.values()].sort((a, b) => b.ads - a.ads);
}
