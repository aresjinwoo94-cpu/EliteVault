import "server-only";
import { parseShopifyProductJson, type BlocksProduct } from "./product-json";

/**
 * Liquid Blocks WP-A — pull a product's real data from the store.
 *
 * Shopify publishes `/products/<handle>.js` with no auth: title, price in
 * cents, variants, images, description. The brief chose this over scraping for
 * a reason — a scraper reads whatever the THEME renders, so it breaks per theme
 * and, worse, fails quietly with plausible-looking wrong numbers. The endpoint
 * is the store's own answer to "what is this product".
 *
 * Every call is bounded and capped. The URL reaching here has already passed
 * `validatePublicStoreUrl` in lib/blocks/entry-gate.ts, and this module only
 * ever derives paths on that same origin, so it can't be pointed somewhere new.
 */

/** Browser-shaped headers. A bare `node-fetch` UA is refused by a lot of stores. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json,text/javascript,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * A product JSON is a few KB. A megabyte means we're being handed something
 * else — usually the store's HTML 404 page — and parsing it is wasted work.
 */
const MAX_BYTES = 512 * 1024;

const DEFAULT_TIMEOUT_MS = 8_000;

export type FetchProductResult =
  | { ok: true; product: BlocksProduct; currency: string | null }
  | { ok: false; code: "NOT_FOUND" | "NOT_SHOPIFY" | "UNREACHABLE"; error: string };

async function getJson(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; json: unknown } | null> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = (await res.text()).slice(0, MAX_BYTES);
  if (!res.ok) return { status: res.status, json: null };
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    // A 200 that isn't JSON is a themed 404 or a bot wall — not a product.
    return { status: res.status, json: null };
  }
}

/**
 * Best-effort currency. `/products/x.js` reports prices in cents but never says
 * in WHAT — and `/cart.js` does. Failing to learn it is fine: the UI then asks
 * the user rather than guessing a symbol, which is the same rule the rest of
 * the feature follows about invented data.
 */
async function fetchCurrency(origin: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await getJson(`${origin}/cart.js`, timeoutMs);
    const c = (res?.json as { currency?: unknown } | null)?.currency;
    return typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

export async function fetchShopifyProduct(
  productJsUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<FetchProductResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let res: { status: number; json: unknown } | null;
  try {
    res = await getJson(productJsUrl, timeoutMs);
  } catch (err) {
    return {
      ok: false,
      code: "UNREACHABLE",
      error: `We couldn't reach that store (${(err as Error).message}). Check the URL opens in your browser and try again.`,
    };
  }

  if (res && res.status === 404) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error:
        "That product URL returned 404 on the store. Copy the URL straight from the product page in your browser.",
    };
  }

  const product = parseShopifyProductJson(res?.json ?? null);
  if (!product) {
    // Reached whenever the endpoint answered with something that isn't a
    // Shopify product: a themed error page, a bot wall, or a real non-Shopify
    // store whose URL happened to contain /products/.
    return {
      ok: false,
      code: "NOT_SHOPIFY",
      error:
        "We couldn't read that product's data. Liquid Blocks supports Shopify stores only for now — if this IS a Shopify store, check the product is published and visible without logging in.",
    };
  }

  const currency = await fetchCurrency(new URL(productJsUrl).origin, timeoutMs);
  return { ok: true, product, currency };
}
