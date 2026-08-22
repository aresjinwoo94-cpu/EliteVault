/**
 * Liquid Blocks WP-A — resolve a pasted product URL to its Shopify identity.
 *
 * Deliberately NOT in lib/analyzer/page-kind.ts, and deliberately stricter than
 * it. `classifyPageKind` answers a platform-agnostic question ("is the audited
 * URL one product?") and is right to call WooCommerce's `/product/x` a product.
 * Blocks asks a narrower one: "can I fetch this product's REAL data?" — and the
 * only answer we have today is Shopify's public `/products/<handle>.js`.
 *
 * Being strict here is a product requirement, not fussiness. The whole promise
 * of the feature is that the block is built from measured facts. A loose parse
 * that resolved to the wrong handle wouldn't fail loudly — it would fetch a
 * DIFFERENT product and render a block full of confidently wrong prices. So
 * anything ambiguous returns null and the caller says "Shopify only, for now".
 *
 * No `server-only` guard: this is pure string work with no secrets, and the
 * client-side launcher can use it to give instant feedback before a round-trip.
 */

export interface ShopifyProductRef {
  /** The product's handle, lowercased exactly as Shopify serves it. */
  handle: string;
  /**
   * Public JSON endpoint for the product. Absolute, same origin as the input,
   * and carrying the input's locale prefix when it had one.
   */
  productJsUrl: string;
}

/** A locale prefix like `en`, `de`, `en-gb` — routing, not structure. */
const LOCALE_SEGMENT = /^[a-z]{2}(?:-[a-z]{2})?$/i;

/**
 * A handle must contain at least one alphanumeric character. `/products/-` and
 * `/products/%20` parse structurally but identify nothing, and sending them to
 * Shopify just buys a 404 several seconds later.
 */
const HAS_SUBSTANCE = /[a-z0-9]/i;

export function parseShopifyProductUrl(
  raw: string | null | undefined,
): ShopifyProductRef | null {
  if (!raw) return null;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  let segments: string[];
  try {
    segments = u.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
  } catch {
    // A malformed percent-escape (`%zz`) throws in decodeURIComponent.
    return null;
  }

  // Strip a leading locale, but REMEMBER it: /en-gb/products/x.js returns that
  // market's price, and quietly dropping the prefix would show a UK shopper the
  // US price — an invented fact in a block that exists to carry real ones.
  const localePrefix =
    segments.length > 0 && LOCALE_SEGMENT.test(segments[0])
      ? segments.shift()!
      : null;

  // Shopify serves exactly two product shapes: /products/<handle> and
  // /collections/<slug>/products/<handle>. The collection is routing context,
  // so both resolve to the same product — and `.js` only exists at the root.
  const i = segments.indexOf("products");
  if (i === -1) return null;
  const positional =
    i === 0 || (i === 2 && segments[0] === "collections");
  if (!positional) return null;

  const handleSegment = segments[i + 1];
  // Trailing segments after the handle (e.g. /products/x/reviews) are not a
  // product page on Shopify — refuse rather than truncate to something that
  // looks right.
  if (!handleSegment || segments.length > i + 2) return null;

  const handle = handleSegment.toLowerCase();
  if (!HAS_SUBSTANCE.test(handle)) return null;

  const prefix = localePrefix ? `/${localePrefix}` : "";
  return {
    handle,
    productJsUrl: `${u.origin}${prefix}/products/${encodeURIComponent(handle)}.js`,
  };
}
