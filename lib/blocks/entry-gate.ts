/**
 * Liquid Blocks WP-A — the gate every submission passes before anything is
 * spent.
 *
 * Three checks that already exist elsewhere, composed in the order that makes
 * a "no" free: the SSRF guard, then the page-kind classifier, then the
 * Shopify-shape parse. All three are pure string work, so a homepage URL is
 * refused in microseconds — no credit touched, no Inngest event sent, no
 * headless browser launched.
 *
 * The Analyzer paid to learn this: for a while it accepted anything longer than
 * three characters, charged for it, queued it, and spent ~200s failing through
 * the whole capture chain and Inngest's retry ladder before refunding. The user
 * waited three minutes to be told what a regex knew immediately.
 *
 * Rejections carry a machine CODE beside the prose because the UI has to react
 * differently to each: "that's a collection page" is the user's to fix and
 * deserves an example; "we only support Shopify" is ours, and pretending
 * otherwise sends them off to edit a URL that was already correct.
 */

import { validatePublicStoreUrl } from "@/lib/security/url-guard";
import { classifyPageKind } from "@/lib/analyzer/page-kind";
import { parseShopifyProductUrl, type ShopifyProductRef } from "./product-url";

export type BlocksUrlRejection = "INVALID_URL" | "NOT_PRODUCT" | "NOT_SHOPIFY";

export type BlocksUrlResult =
  | { ok: true; url: string; ref: ShopifyProductRef }
  | { ok: false; code: BlocksUrlRejection; error: string };

/**
 * Shown when the URL isn't recognisably one product page.
 *
 * Worded as what WE need, not as what the user got wrong. The classifier is
 * Shopify/Woo-shaped, so a platform with flat product URLs
 * (store.com/blue-widget — BigCommerce, most headless setups) lands here even
 * though the user really did paste a product page. Telling that person "that's
 * your homepage" would be flatly false; naming the shape we can read is true
 * either way, and it's also the honest answer for an actual homepage.
 */
const NOT_PRODUCT_MESSAGE =
  "We need a Shopify product page URL — the kind that looks like yourstore.com/products/your-product-name. A homepage or a collection has no single product to build a block around.";

/**
 * Shown when the page IS a product but not on Shopify. Deliberately says what
 * we support instead of implying the user mistyped something.
 */
const NOT_SHOPIFY_MESSAGE =
  "Liquid Blocks only supports Shopify product pages for now — we read the product's real data from its Shopify endpoint, and other platforms don't expose one.";

export function evaluateBlocksUrl(raw: string): BlocksUrlResult {
  // 1. SSRF. Its wording is passed straight through: rewriting it here would
  //    give the same rejection two different explanations depending on which
  //    entry point the user arrived from.
  const guard = validatePublicStoreUrl(raw);
  if (!guard.ok) return { ok: false, code: "INVALID_URL", error: guard.reason };

  // 2. Is it one product page? Platform-agnostic, and the gate the brief calls
  //    important: every downstream assumption (calibrate against the buy box,
  //    inject under the price) is a product-page assumption.
  if (classifyPageKind(guard.url) !== "product") {
    return { ok: false, code: "NOT_PRODUCT", error: NOT_PRODUCT_MESSAGE };
  }

  // 3. Is it a product page we can read REAL data from? Only Shopify publishes
  //    the `.js` endpoint, and without real data the blocks would have to
  //    invent their facts — which the feature refuses to do.
  const ref = parseShopifyProductUrl(guard.url);
  if (!ref) {
    return { ok: false, code: "NOT_SHOPIFY", error: NOT_SHOPIFY_MESSAGE };
  }

  return { ok: true, url: guard.url, ref };
}
