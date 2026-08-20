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
 * Segment names that introduce a product, keyed by where they're allowed.
 *
 * Matching these ANYWHERE in the path was the first implementation and it was
 * wrong: `/shop/about`, `/blog/p/how-we-make-rings` and
 * `/support/product/warranty` all came back "product", which put a confidently
 * false sentence in the prompt AND in the report at the same time. A marker
 * only means "product" in the position a platform actually puts it.
 */
const PRODUCT_MARKERS = new Set(["products", "product", "p", "shop"]);

/** Segment names that introduce a listing. */
const COLLECTION_MARKERS = new Set([
  "collections",
  "collection",
  "category",
  "categories",
  "product-category", // WooCommerce
]);

/**
 * Slugs that are never a product, however the path is shaped.
 *
 * `/shop/` and `/p/` are the genuinely ambiguous markers — plenty of stores use
 * `/shop/<slug>` for products and plenty use it for content. Position alone
 * can't separate `/shop/tote-bag` from `/shop/about`, so this closes the
 * realistic remainder rather than pretending the ambiguity isn't there.
 */
const NEVER_A_PRODUCT = new Set([
  "about", "about-us", "contact", "contact-us", "faq", "faqs", "help",
  "support", "terms", "privacy", "policies", "policy", "legal", "blog",
  "news", "press", "cart", "checkout", "account", "login", "register",
  "search", "sitemap", "returns", "shipping", "stockists", "wholesale",
]);

/** A locale prefix like `en`, `de`, `en-gb`, `fr-fr`. */
const LOCALE_SEGMENT = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export function classifyPageKind(url: string | null | undefined): PageKind {
  if (!url) return "other";

  let path: string;
  try {
    const u = new URL(url);
    if (!u.hostname) return "other";
    if (u.protocol !== "http:" && u.protocol !== "https:") return "other";
    path = u.pathname;
  } catch {
    return "other";
  }

  const segments = path
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s).toLowerCase());

  // A leading locale is routing, not structure — `/en-gb/products/ring` is a
  // product page and `/en-gb/` is the front door, exactly like their unprefixed
  // forms. Dropping it here is what makes both true.
  if (segments.length > 0 && LOCALE_SEGMENT.test(segments[0])) segments.shift();

  // The front door. Query strings and hashes are campaign noise, not structure,
  // and `new URL()` has already stripped them from pathname.
  if (segments.length === 0) return "home";

  // Magento's product URL: /catalog/product/view/id/42
  if (segments[0] === "catalog" && segments[1] === "product") return "product";

  /**
   * A marker counts in the FIRST position, or nested under a collection.
   *
   * The nesting check has to look TWO back, not one: Shopify's canonical
   * product URL is /collections/<collection-slug>/products/<product-slug>, so
   * the segment before `products` is the collection's SLUG, not the marker.
   * Checking only one back silently classified every nested Shopify product
   * URL — the most common shape there is — as a collection.
   */
  const positioned = (i: number) =>
    i === 0 ||
    COLLECTION_MARKERS.has(segments[i - 1]) ||
    (i >= 2 && COLLECTION_MARKERS.has(segments[i - 2]));

  // PRODUCTS ARE SCANNED FIRST, across the whole path. Returning on the first
  // marker of either kind would classify that same Shopify URL as a collection,
  // because `collections` comes before `products` in it.
  for (let i = 0; i < segments.length - 1; i++) {
    if (!positioned(i)) continue;
    if (PRODUCT_MARKERS.has(segments[i]) && !NEVER_A_PRODUCT.has(segments[i + 1])) {
      return "product";
    }
  }
  for (let i = 0; i < segments.length - 1; i++) {
    if (positioned(i) && COLLECTION_MARKERS.has(segments[i])) return "collection";
  }

  // Listing pages that are a single segment rather than a marker + slug.
  if (segments[0] === "shop-all" || segments[0] === "shop") return "collection";

  return "other";
}

/**
 * True when the audit is looking at ONE page rather than the storefront as a
 * whole — the condition that changes how the report and the map should talk.
 */
export function isSinglePage(kind: PageKind): boolean {
  return kind === "product" || kind === "collection";
}
