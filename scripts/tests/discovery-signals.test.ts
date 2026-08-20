import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDiscovery } from "../../lib/analyzer/discovery-signals";
import type { DiscoverySummary } from "../../lib/site-discovery";

/**
 * WP-3 — the "progressive reveal" chips shown WHILE the audit runs.
 *
 * The whole point of this module is that it costs nothing: it's a pure
 * projection of what the discovery step already fetched. These tests pin that
 * it stays small, safe on partial input, and never invents a signal.
 */

function base(over: Partial<DiscoverySummary> = {}): DiscoverySummary {
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
    pageKind: "home" as const,
    ...over,
  };
}

test("summarizes the signals the analyzing screen shows", () => {
  const s = summarizeDiscovery(
    base({
      platform: "shopify",
      ratingSignal: "4.8/5 (1243 reviews)",
      pageUrls: ["https://acme.com", "https://acme.com/products/a", "https://acme.com/products/b"],
      prices: ["$29.99", "$149", "$59.00"],
      trustSignals: [
        "we offer free shipping on all orders over",
        "60 day money back guarantee no questions",
      ],
      reviewSnippets: ["great product", "loved it"],
      faqQuestions: ["How long is shipping?"],
    }),
  );
  assert.equal(s?.platform, "shopify");
  assert.equal(s?.rating, "4.8/5 (1243 reviews)");
  assert.equal(s?.pages, 3);
  assert.equal(s?.priceRange, "$29.99 – $149");
  assert.deepEqual(s?.trust, ["Free shipping", "Money-back guarantee"]);
  assert.equal(s?.reviews, 2);
  assert.equal(s?.faqs, 1);
});

test("returns null instead of guessing when discovery found nothing", () => {
  const s = summarizeDiscovery(base());
  assert.equal(s, null);
});

test("a bare platform detection is still worth showing", () => {
  const s = summarizeDiscovery(base({ platform: "woocommerce" }));
  assert.equal(s?.platform, "woocommerce");
  assert.equal(s?.rating, null);
  assert.deepEqual(s?.trust, []);
});

test("'custom' alone is not a signal — it's the platform fallback", () => {
  // site-discovery sets platform='custom' whenever nothing matched, so on its
  // own it says nothing about the store and must not light up the chip row.
  assert.equal(summarizeDiscovery(base({ platform: "custom" })), null);
  assert.equal(
    summarizeDiscovery(base({ platform: "custom", reviewSnippets: ["nice"] }))?.platform,
    "custom",
  );
});

test("trust labels are canonical and capped — never raw page sentences", () => {
  const s = summarizeDiscovery(
    base({
      trustSignals: [
        "enjoy free shipping worldwide today",
        "secure checkout with stripe and paypal",
        "free returns within 30 days",
        "lifetime warranty on every frame",
        "as seen on forbes and vogue",
      ],
    }),
  );
  assert.equal(s?.trust.length, 3);
  for (const label of s!.trust) {
    assert.ok(label.length <= 24, `"${label}" is too long for a chip`);
  }
  assert.deepEqual(s?.trust, ["Free shipping", "Secure checkout", "Free returns"]);
});

test("unrecognized trust text is dropped rather than shown raw", () => {
  const s = summarizeDiscovery(
    base({ trustSignals: ["handcrafted in a tiny workshop in oaxaca"] }),
  );
  assert.equal(s, null);
});

test("a single price is a point, not a range", () => {
  const s = summarizeDiscovery(base({ prices: ["$49", "$49.00"] }));
  assert.equal(s?.priceRange, "$49");
});

test("locale separators are read, not guessed at", () => {
  // `.` and `,` swap roles between locales and discovery scrapes whatever the
  // page wrote, so getting this wrong is a 1000x error on the waiting screen.
  const range = (price: string) =>
    summarizeDiscovery(base({ prices: [price] }))?.priceRange;

  assert.equal(range("$1,299"), "$1,299"); // en thousands
  assert.equal(range("€1.299,00"), "€1,299"); // de thousands + decimal
  assert.equal(range("$1.234.567,89"), "$1,234,567.89"); // repeated thousands
  assert.equal(range("$29.99"), "$29.99"); // plain decimal
  assert.equal(range("€1.299"), "€1,299"); // lone dot, real thousands group
  // …but "0" is not a thousands group, so this is nine-tenths, not 999.
  assert.equal(range("$0.999"), "$1.00");
});

test("an ISO currency code doesn't run into the number", () => {
  const s = summarizeDiscovery(base({ prices: ["USD 1,299"] }));
  assert.equal(s?.priceRange, "USD 1,299");
});

test("unparseable prices never produce a broken range", () => {
  const s = summarizeDiscovery(base({ prices: ["USD", "$"], platform: "shopify" }));
  assert.equal(s?.priceRange, null);
});

test("mixed currencies keep the symbol of the cheapest, not a mash-up", () => {
  const s = summarizeDiscovery(base({ prices: ["€19", "$300"] }));
  assert.equal(s?.priceRange, "€19 – €300");
});

test("the payload stays small enough to poll every 1.5s", () => {
  const s = summarizeDiscovery(
    base({
      platform: "shopify",
      ratingSignal: "4.9/5 (98123 reviews)",
      pageUrls: Array.from({ length: 3 }, (_, i) => `https://acme.com/${i}`),
      prices: ["$1", "$9999"],
      trustSignals: ["free shipping", "money back guarantee", "secure checkout"],
      reviewSnippets: ["a", "b", "c", "d", "e", "f"],
      faqQuestions: ["a?", "b?", "c?"],
    }),
  );
  assert.ok(JSON.stringify(s).length < 400);
});
