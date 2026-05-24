import "server-only";

/**
 * Multi-page site discovery helpers.
 *
 * Given a starting URL, we:
 *   1. Fetch the homepage HTML
 *   2. Extract product URLs (Shopify /products/, WooCommerce /product/,
 *      Magento /catalog/, generic /shop/ patterns)
 *   3. Extract pricing signals via regex over the HTML
 *   4. Return up to N "interesting" URLs to capture screenshots from
 *
 * This is cheap heuristics — no JS rendering, no headless browser, no Claude
 * call. Good enough to enrich the analyzer's context window so Gemini can
 * see actual prices + product names alongside the screenshot.
 */

const PRODUCT_PATTERNS = [
  /\/products\/[a-z0-9-]+/gi,       // Shopify
  /\/product\/[a-z0-9-]+/gi,        // WooCommerce singular
  /\/shop\/[a-z0-9-]+/gi,
  /\/catalog\/product\/[^"'\s]+/gi, // Magento
  /\/p\/[a-z0-9-]+/gi,              // Common shorthand
];

const PRICE_PATTERN =
  /(?:USD|EUR|GBP|\$|€|£)\s?\d{1,4}(?:[.,]\d{2,3})?(?:\s?\d{3})?/g;

export interface DiscoverySummary {
  /** URLs to capture screenshots of, in priority order. */
  pageUrls: string[];
  /** Detected currency prices on the homepage. */
  prices: string[];
  /** Plain-text title from <title> or og:title. */
  title: string | null;
  /** Stripped meta description / og:description. */
  description: string | null;
  /** Brand-y heuristic — e.g. shopify, woocommerce, generic. */
  platform: string | null;
}

export async function discoverSite(rootUrl: string): Promise<DiscoverySummary> {
  const startedAt = Date.now();
  const out: DiscoverySummary = {
    pageUrls: [rootUrl],
    prices: [],
    title: null,
    description: null,
    platform: null,
  };

  let html = "";
  try {
    const res = await fetch(rootUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EliteVaultAuditBot/1.0; +https://elitevault.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      // Don't hang the pipeline if a site is slow — 8s max.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return out;
    html = await res.text();
  } catch (err) {
    console.warn("[discovery] fetch failed:", (err as Error).message);
    return out;
  }

  // title / description
  out.title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "")
    .trim()
    .slice(0, 140) || null;
  const desc =
    html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ?? "";
  out.description = desc.trim().slice(0, 280) || null;

  // platform detection
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) out.platform = "shopify";
  else if (/wp-content|woocommerce/i.test(html)) out.platform = "woocommerce";
  else if (/static\/version\d+\/frontend/.test(html)) out.platform = "magento";
  else out.platform = "custom";

  // Discover product URLs
  const seen = new Set<string>([rootUrl]);
  for (const re of PRODUCT_PATTERNS) {
    for (const m of html.matchAll(re)) {
      const path = m[0];
      try {
        const u = new URL(path, rootUrl).toString();
        if (!seen.has(u)) {
          seen.add(u);
          out.pageUrls.push(u);
        }
        if (out.pageUrls.length >= 3) break;
      } catch {
        /* skip invalid */
      }
    }
    if (out.pageUrls.length >= 3) break;
  }

  // Prices (de-dup, top 8)
  const priceSet = new Set<string>();
  for (const m of html.matchAll(PRICE_PATTERN)) {
    const p = m[0].replace(/\s+/g, "").trim();
    if (p.length >= 2 && p.length <= 14) priceSet.add(p);
    if (priceSet.size >= 8) break;
  }
  out.prices = Array.from(priceSet);

  const dt = Date.now() - startedAt;
  console.log(
    `[discovery] ${rootUrl} → ${out.pageUrls.length} pages, ${out.prices.length} prices, ${dt}ms (${out.platform})`,
  );

  return out;
}
