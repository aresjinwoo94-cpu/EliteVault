import type { DiscoverySummary } from "@/lib/site-discovery";

/**
 * WP-3 — the "we already know this about your store" chips shown WHILE the
 * audit is still running.
 *
 * The wait is ~30-50s of spinner today, and the single biggest lever on
 * PERCEIVED latency isn't making the pipeline faster — it's showing the user
 * something real early. The discovery step finishes long before the vision
 * call does, and everything it found is already in memory; this module is the
 * pure projection of that into a payload small enough to persist on the row
 * and re-send on every 1.5s poll.
 *
 * Hard rules, so this can never become a latency regression in disguise:
 *   • Pure function — no I/O, no AI, no third-party call.
 *   • Only reports what discovery ACTUALLY found. Never infers, never fills a
 *     gap with a plausible default: a wrong "4.8★" on the waiting screen would
 *     be worse than an honest empty one.
 *   • Returns null when there's nothing worth showing, so the caller can skip
 *     the write and the UI can skip the row entirely.
 */

/** Compact, display-ready projection of a DiscoverySummary. */
export interface DiscoverySignals {
  /** shopify | woocommerce | magento | bigcommerce | custom */
  platform: string | null;
  /** e.g. "4.8/5 (1243 reviews)" — straight from JSON-LD, never derived. */
  rating: string | null;
  /** Pages discovery found to reason about (homepage + product pages). */
  pages: number;
  /** Canonical short trust labels, max 3. */
  trust: string[];
  /** e.g. "$29.99 – $149", or a single price, or null. */
  priceRange: string | null;
  /** Count of review snippets scraped (content stays server-side). */
  reviews: number;
  /** Count of FAQ questions found. */
  faqs: number;
}

/**
 * Canonical chip labels, matched against the raw sentence fragments
 * site-discovery collects. Raw fragments are page prose ("enjoy free shipping
 * worldwide today") — fine as model context, wrong as UI. Anything that
 * doesn't match a known claim is DROPPED rather than shown verbatim.
 *
 * Order is the display order, so the claims a shopper weighs first come first.
 */
const TRUST_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/free (shipping|delivery)/i, "Free shipping"],
  [/money[- ]?back|satisfaction guarantee/i, "Money-back guarantee"],
  [/secure (checkout|payment)|ssl|encrypted/i, "Secure checkout"],
  [/free returns|easy returns|no[- ]questions[- ]asked|day return/i, "Free returns"],
  [/warranty|lifetime guarantee/i, "Warranty"],
  [/verified (buyer|reviews)/i, "Verified reviews"],
  [/as seen on|featured in|trusted by/i, "Press mentions"],
  [/klarna|afterpay|shop pay|paypal/i, "Pay later options"],
];

const MAX_TRUST_CHIPS = 3;

export function summarizeDiscovery(
  discovery: DiscoverySummary | null,
): DiscoverySignals | null {
  if (!discovery) return null;

  const trust: string[] = [];
  for (const [re, label] of TRUST_LABELS) {
    if (trust.length >= MAX_TRUST_CHIPS) break;
    if (discovery.trustSignals.some((raw) => re.test(raw))) trust.push(label);
  }

  const signals: DiscoverySignals = {
    platform: discovery.platform,
    rating: discovery.ratingSignal,
    pages: discovery.pageUrls.length,
    trust,
    priceRange: priceRange(discovery.prices),
    reviews: discovery.reviewSnippets.length,
    faqs: discovery.faqQuestions.length,
  };

  // "Nothing worth showing": discovery ran but came back empty-handed —
  // typically a bot-blocked store that refused the fetch. `platform: "custom"`
  // is the no-match fallback, and `pages: 1` is just the URL we were given, so
  // neither counts as a finding on its own.
  const hasSignal =
    (signals.platform !== null && signals.platform !== "custom") ||
    signals.rating !== null ||
    signals.pages > 1 ||
    trust.length > 0 ||
    signals.priceRange !== null ||
    signals.reviews > 0 ||
    signals.faqs > 0;

  return hasSignal ? signals : null;
}

/**
 * Turn discovery's raw price strings ("$29.99", "€1,299", "USD") into one
 * display range. Returns null when nothing parses — a half-formed "$ – " on the
 * waiting screen reads as a bug.
 */
function priceRange(prices: string[]): string | null {
  const parsed: { value: number; symbol: string }[] = [];
  for (const raw of prices) {
    // The currency marker as written on the page: a symbol, or an ISO code
    // that we render as-is (site-discovery matches USD/EUR/GBP too).
    const symbol = raw.match(/[$€£]|USD|EUR|GBP/)?.[0] ?? "";
    const numeric = raw.replace(/[^\d.,]/g, "");
    if (!numeric) continue;
    // Strip thousands separators, keep the last separator as the decimal point.
    const normalized = numeric.replace(/[.,](?=\d{3}\b)/g, "");
    const value = Number(normalized.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    parsed.push({ value, symbol });
  }
  if (parsed.length === 0) return null;

  parsed.sort((a, b) => a.value - b.value);
  const low = parsed[0];
  const high = parsed[parsed.length - 1];
  // One symbol for both ends — a "€19 – $300" range is a scraping artifact of
  // a page listing two currencies, not a real span. Anchor on the low end.
  const fmt = (n: number) =>
    `${low.symbol}${n % 1 === 0 ? n : n.toFixed(2)}`;
  return low.value === high.value ? fmt(low.value) : `${fmt(low.value)} – ${fmt(high.value)}`;
}
