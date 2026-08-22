/**
 * Liquid Blocks WP-A — normalize Shopify's public `/products/<handle>.js`.
 *
 * This module is the feature's only source of product facts, which makes its
 * REJECTION path the important one. The brief's hard rule is that blocks
 * carrying claims are never autofilled with invented data; the mechanical way
 * that rule survives contact with a real store is here: an unrecognised payload
 * returns null rather than being coerced into a product with a blank title and
 * a $0.00 price that a block would then render as fact.
 *
 * Money stays in integer CENTS end to end. Converting to a float this early is
 * how $39.90 becomes 39.900000000000006 three layers downstream.
 *
 * Pure and dependency-free on purpose — the fetch (and its SSRF-guarded URL)
 * lives in the caller, so this half is trivially testable against real captured
 * payloads.
 */

export interface BlocksProductVariant {
  title: string;
  priceCents: number;
  available: boolean;
}

export interface BlocksProduct {
  title: string;
  handle: string;
  vendor: string | null;
  productType: string | null;
  /** Integer cents in the store's own currency. */
  priceCents: number;
  /** Integer cents, or null when there is no GENUINE compare-at price. */
  compareAtCents: number | null;
  available: boolean;
  /** Raw description HTML from the store, capped. */
  descriptionHtml: string;
  featuredImage: string | null;
  images: string[];
  variants: BlocksProductVariant[];
}

/**
 * Caps. A `blocks_projects` row holds this JSON verbatim and a prompt later
 * carries it to Claude, so an unbounded description is both a fat row and a
 * pile of tokens nobody reads.
 */
const MAX_DESCRIPTION_CHARS = 8_000;
const MAX_IMAGES = 10;
const MAX_VARIANTS = 25;

/** Shopify serves `//cdn.shopify.com/…`; make it absolute. */
function absoluteImage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return null;
}

/** True for a non-negative integer number of cents. */
function isCents(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function parseShopifyProductJson(raw: unknown): BlocksProduct | null {
  // An array is valid JSON and would survive every property check below by
  // returning undefined for each one.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const title = str(o.title);
  if (!title) return null;

  // Deliberately not `?? 0`: "no price in the payload" and "this product is
  // free" are different facts, and only one of them is safe to print.
  if (!isCents(o.price)) return null;
  const priceCents = Math.round(o.price);

  // Shopify leaves stale compare_at values behind after a price cut, so a value
  // that isn't strictly above the real price is not a discount — rendering it
  // would invent one.
  const compareRaw = o.compare_at_price;
  const compareAtCents =
    isCents(compareRaw) && Math.round(compareRaw) > priceCents
      ? Math.round(compareRaw)
      : null;

  const images = (Array.isArray(o.images) ? o.images : [])
    .map(absoluteImage)
    .filter((s): s is string => s !== null)
    .slice(0, MAX_IMAGES);

  const variants = (Array.isArray(o.variants) ? o.variants : [])
    .slice(0, MAX_VARIANTS)
    .map((v): BlocksProductVariant | null => {
      if (!v || typeof v !== "object") return null;
      const vo = v as Record<string, unknown>;
      if (!isCents(vo.price)) return null;
      return {
        title: str(vo.title) ?? "Default",
        priceCents: Math.round(vo.price),
        available: vo.available === true,
      };
    })
    .filter((v): v is BlocksProductVariant => v !== null);

  return {
    title,
    // `.js` echoes the handle; fall back to a slug of the title only for the
    // display side — the caller already has the authoritative handle from the
    // URL and uses that one for fetching.
    handle: str(o.handle) ?? "",
    vendor: str(o.vendor),
    productType: str(o.type),
    priceCents,
    compareAtCents,
    available: o.available === true,
    descriptionHtml: (str(o.description) ?? str(o.body_html) ?? "").slice(
      0,
      MAX_DESCRIPTION_CHARS,
    ),
    featuredImage: absoluteImage(o.featured_image) ?? images[0] ?? null,
    images,
    variants,
  };
}
