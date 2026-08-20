/**
 * WP-B — is the audited URL the shop's front door, or one product page?
 *
 * Until now every audit was framed as "your store", whatever was submitted. So
 * someone auditing a single ring got told their *store* was at a given stage,
 * and could be marked down for missing things that only exist on a homepage.
 * The audit didn't see a store; it saw a page.
 *
 * Deliberately NOT in lib/site-discovery.ts: that module is `server-only`, and
 * the Growth Map is a client component that needs the same answer. Keeping the
 * classifier pure and URL-only means both sides derive it identically with no
 * plumbing and no second source of truth.
 *
 * Nothing here touches scoring. Being wrong costs a misleading sentence, which
 * is why an ambiguous path returns "other" — saying less beats saying something
 * false.
 */

export type PageKind = "home" | "product" | "collection" | "other";

/**
 * Product paths, mirroring PRODUCT_PATTERNS in lib/site-discovery.ts — the same
 * shapes it already uses to FIND product pages, now applied to the URL we were
 * handed. Each requires a slug after the segment, so a bare `/products` listing
 * isn't mistaken for a product.
 */
const PRODUCT_PATHS: RegExp[] = [
  /\/products\/[^/]+/i, // Shopify
  /\/product\/[^/]+/i, // WooCommerce
  /\/shop\/[^/]+/i,
  /\/catalog\/product\//i, // Magento
  /\/p\/[^/]+/i,
];

/**
 * Category/listing paths. Checked AFTER products on purpose: Shopify's
 * canonical product URL nests under a collection
 * (`/collections/wedding/products/beveled-ring`), and that is a product page.
 */
const COLLECTION_PATHS: RegExp[] = [
  /\/collections?\/[^/]+/i,
  /\/categor(?:y|ies)\/[^/]+/i,
  /\/shop-all\b/i,
];

export function classifyPageKind(url: string | null | undefined): PageKind {
  if (!url) return "other";

  let path: string;
  try {
    const u = new URL(url);
    if (!u.hostname) return "other";
    path = u.pathname;
  } catch {
    return "other";
  }

  // The front door. Query strings and hashes are campaign noise, not structure,
  // and `new URL()` has already stripped them from pathname.
  if (path === "" || path === "/") return "home";

  for (const re of PRODUCT_PATHS) if (re.test(path)) return "product";
  for (const re of COLLECTION_PATHS) if (re.test(path)) return "collection";

  return "other";
}

/**
 * True when the audit is looking at ONE page rather than the storefront as a
 * whole — the condition that changes how the report and the map should talk.
 */
export function isSinglePage(kind: PageKind): boolean {
  return kind === "product" || kind === "collection";
}
