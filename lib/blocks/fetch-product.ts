import "server-only";
import { validatePublicStoreUrl } from "@/lib/security/url-guard";
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
 * # Why this module re-validates a URL its caller already validated
 * This is the feature's only network call and the seam WP-B/C/D all build on.
 * The guarantee "we only ever fetch a URL that passed the SSRF guard" used to
 * live in a comment here, which is a guarantee that cannot fail a test suite: a
 * future caller passing a URL read back out of `blocks_projects`, or a
 * well-meaning change to "follow the redirect properly", would break it with
 * everything still green. So the check is now IN the function, and pinned by
 * scripts/tests/blocks-fetch-product.test.ts.
 *
 * The redirect check closes the one hole the URL guard documents that it can't:
 * it is deliberately syntactic and never resolves DNS, so a public hostname
 * that 302s to 169.254.169.254 passes it. Refusing a response that ended up on
 * a different origin is where that gets caught.
 */

/** Browser-shaped headers. A bare `node-fetch` UA is refused by a lot of stores. */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json,text/javascript,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * A product JSON is a few KB. This is enforced WHILE the body streams, not by
 * slicing a string that has already arrived — otherwise a hostile or
 * misconfigured origin can push an unbounded body into the lambda's memory and
 * only the timeout stands in the way.
 */
const MAX_BYTES = 512 * 1024;

const DEFAULT_TIMEOUT_MS = 8_000;

/** Injected in tests so each case states its own scenario. */
export type FetchImpl = (input: string) => Promise<Response>;

export type FetchProductFailure =
  | "NOT_FOUND"
  | "NOT_SHOPIFY"
  | "UNREACHABLE"
  | "INVALID_URL";

export type FetchProductResult =
  | { ok: true; product: BlocksProduct; currency: string | null }
  | { ok: false; code: FetchProductFailure; error: string };

interface RawResponse {
  status: number;
  /** Where the response actually came from, after any redirects. */
  finalUrl: string;
  json: unknown;
  /** True when the body was cut off at MAX_BYTES, so `json` can't be trusted. */
  truncated: boolean;
}

/** Read at most `MAX_BYTES`, cancelling the stream once the cap is hit. */
async function readCapped(res: Response): Promise<{ text: string; truncated: boolean }> {
  const body = res.body;
  if (!body) return { text: "", truncated: false };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  let truncated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        truncated = true;
        break;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    // Stop the transfer rather than politely draining a body we've refused.
    await reader.cancel().catch(() => {});
  }
  if (!truncated) chunks.push(decoder.decode());
  return { text: chunks.join(""), truncated };
}

async function getJson(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchImpl,
): Promise<RawResponse> {
  const res = await fetchImpl(url);
  const { text, truncated } = await readCapped(res);
  // `res.url` is "" on a synthesized Response; fall back to what we asked for
  // rather than treating "unknown" as "off-origin".
  const finalUrl = res.url || url;
  if (!res.ok || truncated) {
    return { status: res.status, finalUrl, json: null, truncated };
  }
  try {
    return { status: res.status, finalUrl, json: JSON.parse(text), truncated: false };
  } catch {
    // A 200 that isn't JSON is a themed 404 or a bot wall — not a product.
    return { status: res.status, finalUrl, json: null, truncated: false };
  }
}

/** True when `finalUrl` is on the same origin we validated and asked for. */
function sameOrigin(requested: string, finalUrl: string): boolean {
  try {
    return new URL(requested).origin === new URL(finalUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Best-effort currency. `/products/x.js` reports prices in cents but never says
 * in WHAT — and `/cart.js` does. Failing to learn it is fine: the UI then asks
 * the user rather than guessing a symbol, which is the same rule the rest of
 * the feature follows about invented data.
 */
async function fetchCurrency(
  origin: string,
  timeoutMs: number,
  fetchImpl: FetchImpl,
): Promise<string | null> {
  try {
    const url = `${origin}/cart.js`;
    const res = await getJson(url, timeoutMs, fetchImpl);
    if (!sameOrigin(url, res.finalUrl)) return null;
    const c = (res.json as { currency?: unknown } | null)?.currency;
    return typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

const UNREACHABLE_MESSAGE =
  "We couldn't read that page from your store — it answered, but not with your product. That's usually a bot filter or the store being briefly down. Try again in a minute.";

export async function fetchShopifyProduct(
  productJsUrl: string,
  opts: { timeoutMs?: number; fetchImpl?: FetchImpl } = {},
): Promise<FetchProductResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseFetch: FetchImpl =
    opts.fetchImpl ??
    ((input) =>
      fetch(input, {
        headers: BROWSER_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      }));

  // The backstop described in the header. Callers are expected to have run the
  // guard already; this makes "we never fetch an unvalidated URL" a property of
  // the code rather than of everyone remembering.
  const guard = validatePublicStoreUrl(productJsUrl);
  if (!guard.ok) {
    return { ok: false, code: "INVALID_URL", error: guard.reason };
  }

  let res: RawResponse;
  try {
    res = await getJson(productJsUrl, timeoutMs, baseFetch);
  } catch (err) {
    return {
      ok: false,
      code: "UNREACHABLE",
      error: `We couldn't reach that store (${(err as Error).message}). Check the URL opens in your browser and try again.`,
    };
  }

  // A redirect that left the origin we validated is refused outright. Nothing
  // downstream gets to see the body.
  if (!sameOrigin(productJsUrl, res.finalUrl)) {
    return {
      ok: false,
      code: "UNREACHABLE",
      error:
        "That URL redirected to a different site, so we stopped. Paste the product URL from the store you want blocks for.",
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      code: "NOT_FOUND",
      error:
        "That product URL returned 404 on the store. Copy the URL straight from the product page in your browser.",
    };
  }

  // 403 is a bot wall, 429 is rate limiting, 5xx is the store being down —
  // every one of them is a Shopify store saying no. Reporting those as "you're
  // not on Shopify" would be a confidently false statement about someone's own
  // business, which is exactly the failure mode this feature exists to avoid.
  if (res.status !== 200 || res.truncated) {
    return { ok: false, code: "UNREACHABLE", error: UNREACHABLE_MESSAGE };
  }

  const product = parseShopifyProductJson(res.json);
  if (!product) {
    // A 200 with a body that isn't a Shopify product: a themed error page, or a
    // genuinely non-Shopify store whose URL happened to contain /products/.
    return {
      ok: false,
      code: "NOT_SHOPIFY",
      error:
        "We couldn't read that product's data. Liquid Blocks supports Shopify stores only for now — if this IS a Shopify store, check the product is published and visible without logging in.",
    };
  }

  const currency = await fetchCurrency(
    new URL(productJsUrl).origin,
    timeoutMs,
    baseFetch,
  );
  return { ok: true, product, currency };
}
