import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPageKind, isSinglePage } from "../../lib/analyzer/page-kind";
import { summarizeDiscovery } from "../../lib/analyzer/discovery-signals";
import { buildAnalyzerUserMessage } from "../../ai/prompts";
import type { DiscoverySummary } from "../../lib/site-discovery";

/**
 * WP-B — is the URL we were given the shop's front door, or one product?
 *
 * Everything downstream is copy, not scoring: the audit shouldn't tell someone
 * their PRODUCT page is missing a full catalogue nav, and the Growth Map
 * shouldn't imply it read the whole business when it saw one page. So the cost
 * of being wrong is a misleading sentence, and the right default when the URL
 * is ambiguous is "other" — say less rather than say something false.
 */

test("the front door is home, with or without a trailing slash", () => {
  for (const url of [
    "https://acme.com",
    "https://acme.com/",
    "https://www.acme.com/",
    "https://acme.com/?utm_source=meta",
    "https://acme.com/#hero",
  ]) {
    assert.equal(classifyPageKind(url), "home", url);
  }
});

test("the platform product paths are recognised", () => {
  const cases = [
    "https://acme.com/products/beveled-ring", // Shopify
    "https://acme.com/product/blue-widget", // WooCommerce
    "https://acme.com/shop/blue-widget", // generic
    "https://acme.com/catalog/product/view/id/42", // Magento
    "https://acme.com/p/blue-widget", // shorthand
  ];
  for (const url of cases) assert.equal(classifyPageKind(url), "product", url);
});

test("collection and category paths are their own kind", () => {
  const cases = [
    "https://acme.com/collections/rings",
    "https://acme.com/collection/rings",
    "https://acme.com/category/rings",
    "https://acme.com/categories/rings",
    "https://acme.com/shop-all",
  ];
  for (const url of cases) assert.equal(classifyPageKind(url), "collection", url);
});

test("a Shopify product nested under a collection is a PRODUCT", () => {
  // The canonical Shopify shape. Getting this backwards would tell someone
  // auditing one ring that they're looking at a category page.
  assert.equal(
    classifyPageKind("https://acme.com/collections/wedding/products/beveled-ring"),
    "product",
  );
});

test("a bare /collections listing is a collection, not a product", () => {
  assert.equal(classifyPageKind("https://acme.com/collections/all"), "collection");
});

test("everything else is 'other' rather than a guess", () => {
  for (const url of [
    "https://acme.com/blog/how-we-make-rings",
    "https://acme.com/about",
    "https://acme.com/pages/contact",
    "https://acme.com/policies/refund-policy",
  ]) {
    assert.equal(classifyPageKind(url), "other", url);
  }
});

test("a missing or malformed URL never throws and never guesses", () => {
  // Uploaded-screenshot audits have no URL at all.
  assert.equal(classifyPageKind(null), "other");
  assert.equal(classifyPageKind(undefined), "other");
  assert.equal(classifyPageKind(""), "other");
  assert.equal(classifyPageKind("not a url"), "other");
  assert.equal(classifyPageKind("https://"), "other");
});

test("classification ignores case and query noise", () => {
  assert.equal(
    classifyPageKind("https://ACME.com/Products/Beveled-Ring?variant=42#reviews"),
    "product",
  );
});

test("a marker only counts where a platform actually puts it", () => {
  // Regression: matching these anywhere in the path put a confidently false
  // sentence in BOTH the prompt and the report at once — the audit would tell
  // someone their About page was "a single product page".
  for (const url of [
    "https://acme.com/shop/about",
    "https://acme.com/pages/shop/about",
    "https://acme.com/blog/p/how-we-make-rings",
    "https://acme.com/help/p/faq",
    "https://acme.com/support/product/warranty",
    "https://acme.com/blog/collections/spring-lookbook",
  ]) {
    assert.notEqual(classifyPageKind(url), "product", url);
  }
});

test("locale prefixes are routing, not structure", () => {
  // Extremely common on DTC stores, and both halves have to hold.
  assert.equal(classifyPageKind("https://acme.com/en-us/products/ring"), "product");
  assert.equal(classifyPageKind("https://acme.com/de/collections/schuhe"), "collection");
  assert.equal(classifyPageKind("https://acme.com/en-gb/"), "home");
  assert.equal(classifyPageKind("https://acme.com/fr"), "home");
});

test("a shop archive is a listing, not a product", () => {
  // WooCommerce's /shop/ IS the catalogue page; its products live at /product/.
  assert.equal(classifyPageKind("https://acme.com/shop"), "collection");
  assert.equal(classifyPageKind("https://acme.com/shop/"), "collection");
  assert.equal(classifyPageKind("https://acme.com/product-category/shirts"), "collection");
  // …but a real Woo/generic product slug under /shop/ still reads as one.
  assert.equal(classifyPageKind("https://acme.com/shop/blue-widget"), "product");
});

test("a word merely CONTAINING a keyword isn't a match", () => {
  // "/shopping-guide" is editorial, not a product; "/production" is not
  // "/product/". Substring matching here would mislabel content pages.
  assert.equal(classifyPageKind("https://acme.com/shopping-guide"), "other");
  assert.equal(classifyPageKind("https://acme.com/production-notes"), "other");
  assert.equal(classifyPageKind("https://acme.com/products"), "other");
});

test("only product and collection count as a single page", () => {
  assert.equal(isSinglePage("product"), true);
  assert.equal(isSinglePage("collection"), true);
  assert.equal(isSinglePage("home"), false);
  // "other" is the ambiguous bucket — claiming it's one page would be a guess.
  assert.equal(isSinglePage("other"), false);
});

// ── persistence + prompt wiring ────────────────────────────────────────────

function discovery(over: Partial<DiscoverySummary> = {}): DiscoverySummary {
  return {
    pageUrls: ["https://acme.com"],
    prices: [],
    title: null,
    description: null,
    platform: null,
    headings: [],
    bodyExcerpt: null,
    reviewSnippets: [],
    ratingSignal: null,
    trustSignals: [],
    faqQuestions: [],
    ctaTexts: [],
    imageAlts: [],
    pageKind: "home",
    ...over,
  };
}

test("pageKind is persisted with the other discovery signals", () => {
  const s = summarizeDiscovery(discovery({ platform: "shopify", pageKind: "product" }));
  assert.equal(s?.pageKind, "product");
});

test("a single page survives even when discovery found nothing else", () => {
  // A store that yielded no other signal still must not be described as "your
  // store" when the audit only saw one product page — so this must NOT collapse
  // to null the way a signal-less home page does.
  const product = summarizeDiscovery(discovery({ pageKind: "product" }));
  assert.equal(product?.pageKind, "product");
  // …while a signal-less HOME page has genuinely nothing to say.
  assert.equal(summarizeDiscovery(discovery({ pageKind: "home" })), null);
});

test("the prompt tells the model what kind of page it is looking at", () => {
  const product = buildAnalyzerUserMessage({
    url: "https://acme.com/products/ring",
    pageKind: "product",
  });
  assert.match(product, /SINGLE PRODUCT PAGE/);
  assert.match(product, /not the store's homepage/);
  // The instruction that stops the misleading criticism.
  assert.match(product, /catalogue navigation/);

  const collection = buildAnalyzerUserMessage({
    url: "https://acme.com/collections/rings",
    pageKind: "collection",
  });
  assert.match(collection, /COLLECTION \/ CATEGORY PAGE/);
});

test("a homepage audit's prompt is unchanged — no new framing", () => {
  // Acceptance criterion: auditing the front door must behave exactly as before.
  const home = buildAnalyzerUserMessage({ url: "https://acme.com", pageKind: "home" });
  const legacy = buildAnalyzerUserMessage({ url: "https://acme.com" });
  assert.equal(home, legacy);
  assert.doesNotMatch(home, /PAGE TYPE/);

  // "other" is ambiguous, so it says nothing rather than guessing.
  const other = buildAnalyzerUserMessage({
    url: "https://acme.com/blog/post",
    pageKind: "other",
  });
  assert.doesNotMatch(other, /PAGE TYPE/);
});
