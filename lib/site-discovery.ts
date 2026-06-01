import "server-only";

/**
 * Multi-page site discovery + full-page content extraction.
 *
 * Given a starting URL, we:
 *   1. Fetch the full HTML
 *   2. Extract product URLs (Shopify /products/, WooCommerce /product/,
 *      Magento /catalog/, generic /shop/ patterns)
 *   3. Extract pricing signals via regex over the HTML
 *   4. v3.3 — extract page CONTENT below the fold so the analyzer's
 *      written audit can reason about reviews, trust badges, FAQ,
 *      product description, and other elements that aren't visible
 *      in the screenshot's first viewport.
 *   5. Return up to N "interesting" URLs to capture screenshots from
 *
 * Why we don't use a real HTML parser:
 *   • cheerio adds ~300KB to the serverless bundle
 *   • we don't need DOM correctness — just enough to get text + alt + IDs
 *   • regex is fast (~30ms on a 200KB page) and good enough for the
 *     85% case (Shopify/WooCommerce/Magento default themes)
 *
 * Why static HTML (no JS rendering):
 *   • Free / no headless browser dependency
 *   • Shopify embeds aggregateRating + reviews in <script type="ld+json">
 *     for SEO, so we catch them statically
 *   • If a site uses JS-only reviews (Judge.me, Loox, Yotpo) we miss
 *     them — that's a known limitation. The AI can note their absence
 *     which is itself a useful signal.
 */

const PRODUCT_PATTERNS = [
  /\/products\/[a-z0-9-]+/gi,       // Shopify
  /\/product\/[a-z0-9-]+/gi,        // WooCommerce singular
  /\/shop\/[a-z0-9-]+/gi,
  /\/catalog\/product\/[^"'\s]+/gi, // Magento
  /\/p\/[a-z0-9-]+/gi,              // Common shorthand
];

const PRICE_PATTERN =
  /(?:USD|EUR|GBP|\$|€|£)\s?\d{1,4}(?:[.,]\d{2,3})?(?:\s?\d{3})?/g;

// Keywords that flag trust/credibility signals in surrounding text.
// We look for these inside element text (buttons, badges, banner copy).
const TRUST_KEYWORDS = [
  // shipping
  "free shipping", "fast shipping", "express shipping", "worldwide shipping",
  "free delivery",
  // returns / guarantee
  "money[- ]back", "money back guarantee", "satisfaction guarantee",
  "free returns", "easy returns", "no[- ]questions[- ]asked",
  "day return", "day guarantee", "lifetime guarantee", "lifetime warranty",
  "warranty",
  // payments / security
  "secure checkout", "secure payment", "ssl", "encrypted",
  "stripe", "shop pay", "klarna", "afterpay", "paypal",
  // reviews / social proof
  "verified buyer", "verified reviews", "thousands of customers",
  "as seen on", "featured in", "trusted by",
  // claims
  "made in", "vegan", "cruelty[- ]free", "organic", "natural ingredients",
  "doctor[- ]formulated", "dermatologist[- ]tested", "lab[- ]tested",
];

// Selectors / class hints for review sections
const REVIEW_HINTS = [
  /class=["'][^"']*\b(reviews?|testimonials?|ratings?|judge[- ]?me|loox|yotpo|stamped)\b[^"']*["']/gi,
  /id=["'][^"']*\b(reviews?|testimonials?|customer-reviews?)\b[^"']*["']/gi,
];

export interface DiscoverySummary {
  /** URLs to capture screenshots of, in priority order. */
  pageUrls: string[];
  /** Detected currency prices on the page. */
  prices: string[];
  /** Plain-text title from <title> or og:title. */
  title: string | null;
  /** Stripped meta description / og:description. */
  description: string | null;
  /** Brand-y heuristic — e.g. shopify, woocommerce, generic. */
  platform: string | null;

  // ── v3.3 — full-page content extraction ───────────────────────────────
  /** H1-H3 headings in document order (first 12). Section structure signal. */
  headings: string[];
  /** First ~2500 chars of visible body text after script/style strip. */
  bodyExcerpt: string | null;
  /** Detected review/testimonial text snippets (first 6). */
  reviewSnippets: string[];
  /**
   * Aggregate rating extracted from JSON-LD ratingValue/reviewCount if present.
   * Format: "4.8/5 (1243 reviews)" or null if not detected.
   */
  ratingSignal: string | null;
  /** Trust / credibility phrases found in the page (free shipping, etc). */
  trustSignals: string[];
  /** FAQ question texts (first 8 if a FAQ section is present). */
  faqQuestions: string[];
  /** Button / link CTA text (first 10 unique). */
  ctaTexts: string[];
  /** Image alt texts (first 12) — useful for trust badges and product imagery. */
  imageAlts: string[];
}

export async function discoverSite(rootUrl: string): Promise<DiscoverySummary> {
  const startedAt = Date.now();
  const out: DiscoverySummary = {
    pageUrls: [rootUrl],
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
  };

  let html = "";
  try {
    const res = await fetch(rootUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; EliteVaultAuditBot/1.0; +https://elitevaultapp.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      // Don't hang the pipeline if a site is slow — 10s max for full-page fetch.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return out;
    html = await res.text();
  } catch (err) {
    console.warn("[discovery] fetch failed:", (err as Error).message);
    return out;
  }

  // ── Basic meta ───────────────────────────────────────────────────────
  out.title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "")
    .trim()
    .slice(0, 140) || null;
  const desc =
    html.match(
      /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ?? "";
  out.description = desc.trim().slice(0, 280) || null;

  // ── Platform detection ───────────────────────────────────────────────
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) out.platform = "shopify";
  else if (/wp-content|woocommerce/i.test(html)) out.platform = "woocommerce";
  else if (/static\/version\d+\/frontend/.test(html)) out.platform = "magento";
  else if (/bigcommerce/i.test(html)) out.platform = "bigcommerce";
  else out.platform = "custom";

  // ── Product URLs ─────────────────────────────────────────────────────
  const seen = new Set<string>([rootUrl]);
  for (const re of PRODUCT_PATTERNS) {
    for (const m of html.matchAll(re)) {
      try {
        const u = new URL(m[0], rootUrl).toString();
        if (!seen.has(u)) {
          seen.add(u);
          out.pageUrls.push(u);
        }
        if (out.pageUrls.length >= 3) break;
      } catch {
        /* skip invalid */
      }
    }
    if (out.pageUrls.length >= 3) break;
  }

  // ── Prices ───────────────────────────────────────────────────────────
  const priceSet = new Set<string>();
  for (const m of html.matchAll(PRICE_PATTERN)) {
    const p = m[0].replace(/\s+/g, "").trim();
    if (p.length >= 2 && p.length <= 14) priceSet.add(p);
    if (priceSet.size >= 8) break;
  }
  out.prices = Array.from(priceSet);

  // ── v3.3 — Strip noise, then extract structured content ──────────────
  // Strip script, style, noscript, svg — they don't contribute to user content
  // and contain a lot of noise (lots of JSON, base64, etc.)
  const noScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "");

  // Headings (H1-H3)
  out.headings = collectMatches(
    noScripts,
    /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi,
    12,
    (m) => stripTags(m[1]).slice(0, 200),
  );

  // CTAs — button text + anchor text that looks like a CTA
  out.ctaTexts = collectMatches(
    noScripts,
    /<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi,
    30,
    (m) => stripTags(m[1]).trim(),
  )
    .filter(
      (t) =>
        t.length >= 2 &&
        t.length <= 80 &&
        // CTA-y verbs / short calls
        /\b(buy|shop|add to cart|order|get|claim|start|try|book|sign up|subscribe|join|learn more|view|see|discover|reserve)\b/i.test(
          t,
        ),
    )
    .slice(0, 10);

  // Image alt texts — trust badges, product images. Often "secure checkout",
  // "30-day return", "Made in Italy", etc.
  out.imageAlts = collectMatches(
    noScripts,
    /<img\b[^>]+alt=["']([^"']{2,120})["']/gi,
    25,
    (m) => m[1].trim(),
  )
    .filter((a) => a.length >= 3)
    .slice(0, 12);

  // Trust signals — scan visible text for the keyword bank
  const visibleText = stripTags(noScripts);
  const lower = visibleText.toLowerCase();
  const trustHits = new Set<string>();
  for (const kw of TRUST_KEYWORDS) {
    const re = new RegExp(`[^.!?]{0,40}\\b${kw}\\b[^.!?]{0,40}`, "i");
    const m = lower.match(re);
    if (m) trustHits.add(m[0].trim().replace(/\s+/g, " ").slice(0, 100));
    if (trustHits.size >= 12) break;
  }
  // Also check image alt texts for trust badges
  for (const alt of out.imageAlts) {
    if (TRUST_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`, "i").test(alt))) {
      trustHits.add(`[badge: ${alt}]`);
    }
    if (trustHits.size >= 12) break;
  }
  out.trustSignals = Array.from(trustHits);

  // Reviews — detect review-flagged blocks and extract snippets
  for (const re of REVIEW_HINTS) {
    re.lastIndex = 0; // reset stateful regex
    if (re.test(noScripts)) {
      // We found a review-flagged section. Pull short snippets of plain text
      // from that area (limit to first 6 short quotes).
      break;
    }
  }
  // Look for actual review-looking text: short sentences in proximity to
  // class="review" / class="testimonial" containers
  const reviewBlocks = collectMatches(
    noScripts,
    /class=["'][^"']*\b(?:review|testimonial|customer-says)[^"']*["'][^>]*>([\s\S]{30,400}?)</gi,
    8,
    (m) => stripTags(m[1]).trim(),
  )
    .filter((t) => t.length >= 30 && t.length <= 400)
    .slice(0, 6);
  out.reviewSnippets = reviewBlocks;

  // Aggregate rating via JSON-LD (Shopify SEO often embeds this)
  const ldJsonMatches = html.matchAll(
    /<script\b[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of ldJsonMatches) {
    try {
      const data = JSON.parse(m[1].trim()) as unknown;
      const rating = findRating(data);
      if (rating) {
        out.ratingSignal = rating;
        break;
      }
    } catch {
      /* malformed JSON-LD — skip */
    }
  }

  // FAQ — detect <details>/<summary> blocks or itemprop="acceptedAnswer"
  const faqFromDetails = collectMatches(
    noScripts,
    /<summary[^>]*>([\s\S]*?)<\/summary>/gi,
    10,
    (m) => stripTags(m[1]).trim(),
  )
    .filter((q) => q.length >= 5 && q.length <= 200)
    .slice(0, 8);
  out.faqQuestions = faqFromDetails;
  // If no <details>, try schema.org markup
  if (out.faqQuestions.length === 0) {
    const faqFromSchema = collectMatches(
      noScripts,
      /itemprop=["']name["'][^>]*>([\s\S]{5,200}?)</gi,
      15,
      (m) => stripTags(m[1]).trim(),
    )
      .filter((q) => q.endsWith("?") && q.length <= 200)
      .slice(0, 8);
    out.faqQuestions = faqFromSchema;
  }

  // Body excerpt — first ~2500 chars of visible, non-nav text
  // Heuristic: strip nav/header/footer/aside blocks before extracting text
  const mainContent = noScripts
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<header\b[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, "");
  const mainText = stripTags(mainContent);
  out.bodyExcerpt = mainText.length > 0 ? mainText.slice(0, 2500) : null;

  const dt = Date.now() - startedAt;
  console.log(
    `[discovery] ${rootUrl} → ${out.pageUrls.length} pages, ${out.prices.length} prices, ` +
      `${out.headings.length} headings, ${out.trustSignals.length} trust, ` +
      `${out.reviewSnippets.length} reviews${out.ratingSignal ? " + rating" : ""}, ` +
      `${out.faqQuestions.length} faqs, ${dt}ms (${out.platform})`,
  );

  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Collect up to `limit` regex matches and map them to clean strings. */
function collectMatches(
  src: string,
  re: RegExp,
  limit: number,
  map: (m: RegExpMatchArray) => string,
): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(re)) {
    const v = map(m);
    if (v) out.add(v);
    if (out.size >= limit) break;
  }
  return Array.from(out);
}

/** Strip HTML tags and collapse whitespace. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recursively walk a JSON-LD object looking for aggregateRating /
 * ratingValue / reviewCount. Returns a one-line formatted string or null.
 */
function findRating(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  // Direct aggregateRating object
  const ar =
    (obj.aggregateRating as Record<string, unknown> | undefined) ??
    (obj["@type"] === "AggregateRating" ? obj : undefined);
  if (ar && typeof ar === "object") {
    const rv = ar.ratingValue;
    const rc = ar.reviewCount ?? ar.ratingCount;
    if (rv != null) {
      const rcStr = rc != null ? ` (${rc} reviews)` : "";
      return `${rv}/5${rcStr}`;
    }
  }

  // Recurse into arrays
  if (Array.isArray(data)) {
    for (const item of data) {
      const r = findRating(item);
      if (r) return r;
    }
  }

  // Recurse into object fields (like @graph in JSON-LD)
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const r = findRating(v);
      if (r) return r;
    }
  }

  return null;
}
