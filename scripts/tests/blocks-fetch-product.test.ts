import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchShopifyProduct } from "../../lib/blocks/fetch-product";

/**
 * WP-A — the feature's only network call, pinned down.
 *
 * This module is the seam WP-B, WP-C and WP-D all build on, and until now its
 * safety properties lived in a header comment. A comment can't fail a test
 * suite: a future change that followed a redirect off-origin, or a caller that
 * passed a URL read back out of the database, would break the guarantee with
 * every test still green.
 *
 * The properties being pinned:
 *   1. Nothing is fetched until the URL has passed validatePublicStoreUrl —
 *      even when the caller swears it already did.
 *   2. A redirect that lands on a different origin is refused, not followed
 *      into. The URL guard is explicitly syntactic (it does no DNS), so
 *      "public hostname 302s to 169.254.169.254" is the hole it can't close on
 *      its own, and this is where it gets closed.
 *   3. The body is capped as it streams, not after it has all arrived.
 *   4. A store that refuses us (403/429/5xx) is reported as unreachable, not
 *      as "you're not on Shopify" — which would be a false statement about
 *      someone's own business.
 *
 * `fetchImpl` is injected rather than mocked globally so each case states its
 * own scenario and no test can leak a stub into another.
 */

const PRODUCT = {
  id: 1,
  title: "Beveled Signet Ring",
  handle: "beveled-signet-ring",
  price: 8900,
  available: true,
  images: [],
  variants: [{ id: 1, title: "Default", price: 8900, available: true }],
};

/** Build a Response whose `url` reflects where it actually ended up. */
function reply(
  body: string,
  { status = 200, url = "https://acme.com/products/beveled-signet-ring.js" } = {},
): Response {
  const res = new Response(body, { status });
  Object.defineProperty(res, "url", { value: url });
  return res;
}

/** A fetch that answers the product endpoint and the cart endpoint. */
function storeFetch(
  overrides: {
    product?: () => Response;
    cart?: () => Response;
    onCall?: (url: string) => void;
  } = {},
) {
  const calls: string[] = [];
  const impl = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    overrides.onCall?.(url);
    if (url.includes("/cart.js")) {
      return overrides.cart?.() ?? reply(JSON.stringify({ currency: "USD" }), { url });
    }
    return overrides.product?.() ?? reply(JSON.stringify(PRODUCT));
  };
  return { impl, calls };
}

test("a real product endpoint returns the parsed product and the store's currency", async () => {
  const { impl } = storeFetch();
  const res = await fetchShopifyProduct(
    "https://acme.com/products/beveled-signet-ring.js",
    { fetchImpl: impl },
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.product.title, "Beveled Signet Ring");
  assert.equal(res.product.priceCents, 8900);
  assert.equal(res.currency, "USD");
});

test("a URL that fails the SSRF guard is refused WITHOUT any network call", async () => {
  // The caller is supposed to have validated already. This is the backstop for
  // when it didn't — a URL read back out of blocks_projects, say, or a new
  // caller added three work packages from now.
  for (const url of [
    "http://169.254.169.254/products/x.js",
    "http://localhost/products/x.js",
    "http://192.168.0.10/products/x.js",
    "file:///etc/passwd",
  ]) {
    const { impl, calls } = storeFetch();
    const res = await fetchShopifyProduct(url, { fetchImpl: impl });
    assert.equal(res.ok, false, url);
    assert.deepEqual(calls, [], `${url} must not be fetched at all`);
  }
});

test("a redirect that leaves the validated origin is refused, not followed into", async () => {
  // The URL guard is syntactic by documented design — it never resolves DNS.
  // So a public hostname that 302s to a metadata address is precisely the case
  // it cannot see, and this is the check that catches it.
  const { impl } = storeFetch({
    product: () =>
      reply(JSON.stringify(PRODUCT), { url: "http://169.254.169.254/latest/meta-data" }),
  });
  const res = await fetchShopifyProduct(
    "https://acme.com/products/beveled-signet-ring.js",
    { fetchImpl: impl },
  );
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "UNREACHABLE");
});

test("a same-origin redirect is fine", async () => {
  // http→https and adding/removing `www` are ordinary and must keep working.
  const { impl } = storeFetch({
    product: () =>
      reply(JSON.stringify(PRODUCT), {
        url: "https://acme.com/en/products/beveled-signet-ring.js",
      }),
  });
  const res = await fetchShopifyProduct(
    "https://acme.com/products/beveled-signet-ring.js",
    { fetchImpl: impl },
  );
  assert.equal(res.ok, true);
});

test("a 404 says the product URL is wrong, because that is what it means", async () => {
  const { impl } = storeFetch({ product: () => reply("Not found", { status: 404 }) });
  const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
    fetchImpl: impl,
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "NOT_FOUND");
});

test("a store that refuses us is unreachable — not 'you're not on Shopify'", async () => {
  // 403 is a bot wall, 429 is rate limiting, 503 is the store being down. Every
  // one of them is a Shopify store saying no. Telling the owner their store
  // isn't Shopify would be a confidently false statement about their business.
  for (const status of [403, 429, 500, 503]) {
    const { impl } = storeFetch({ product: () => reply("nope", { status }) });
    const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
      fetchImpl: impl,
    });
    assert.equal(res.ok, false, `status ${status}`);
    if (res.ok) continue;
    assert.equal(res.code, "UNREACHABLE", `status ${status}`);
  }
});

test("a 200 that isn't JSON is a themed 404 or a bot wall, reported as non-Shopify", async () => {
  const { impl } = storeFetch({
    product: () => reply("<!doctype html><html>Sorry, this page…</html>"),
  });
  const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
    fetchImpl: impl,
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "NOT_SHOPIFY");
});

test("an oversized body is cut off as it streams instead of being buffered whole", async () => {
  // A product JSON is a few KB. Without a streaming cap, a hostile or
  // misconfigured origin can push an unbounded body into the lambda's memory,
  // and only the 8s timeout stands in the way.
  const huge = JSON.stringify({ ...PRODUCT, description: "x".repeat(2_000_000) });
  const { impl } = storeFetch({ product: () => reply(huge) });
  const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
    fetchImpl: impl,
  });
  // Truncated JSON can't parse, so this surfaces as "not a product" rather than
  // as a 2MB string sitting in a database row.
  assert.equal(res.ok, false);
});

test("a store with no readable currency still yields the product", async () => {
  // Currency is a nice-to-have. Losing it must not lose the product — and the
  // UI then asks rather than guessing a symbol.
  const { impl } = storeFetch({ cart: () => reply("nope", { status: 404 }) });
  const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
    fetchImpl: impl,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.currency, null);
});

test("a currency that isn't a 3-letter code is discarded rather than displayed", async () => {
  const { impl } = storeFetch({
    cart: () => reply(JSON.stringify({ currency: "dollars" })),
  });
  const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
    fetchImpl: impl,
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.currency, null);
});

test("a network throw is reported as unreachable, not as a crash", async () => {
  const impl = async () => {
    throw new Error("ECONNREFUSED");
  };
  const res = await fetchShopifyProduct("https://acme.com/products/x.js", {
    fetchImpl: impl,
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.code, "UNREACHABLE");
});
