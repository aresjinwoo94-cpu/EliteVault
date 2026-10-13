/**
 * Store verification for the Library publication gate (WP-L2, brief oct-2026 §L.5).
 *
 * "Winning Shopify stores" is the product, so a row must PROVE it is one before it is published:
 *   • it is a Shopify store (the product is for Shopify merchants),
 *   • the domain really is that brand (catches `athleticgreens.com`-style wrong domains, and
 *     `bala.com` — a university site — saved as the fitness brand Bala),
 *   • it sells physical products (a /products/ or /collections/ catalogue, not an app / SaaS),
 *   • its home content fits the niche it was filed under.
 *
 * The analyzers are PURE (they take the HTML + headers) so they are testable offline and shared by
 * the weekly job and the local audit script. No `server-only` / Supabase import on purpose.
 *
 * Evidence is persisted in `winning_sites.store_checks` so the weekly job does not need to fetch
 * the home of every store again (and a store that merely blocks our fetch with a 403 keeps the
 * evidence it already has instead of being demoted).
 */

export const STORE_CHECK_VERSION = 1;
/** Evidence older than this is re-checked by the weekly job. */
export const STORE_CHECK_MAX_AGE_DAYS = 90;

export interface HomeFetch {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  headers: Record<string, string>;
  /** `/cart.js` answered Shopify's JSON (undefined = not tried). */
  cartJson?: boolean;
  error?: string;
}

export interface StoreEvidence {
  v: number;
  checkedAt: string;
  /** How the home was read: plain HTTP fetch, or a real browser (bot-walled stores). */
  via: "fetch" | "browser";
  reachable: boolean;
  status: number;
  shopify: boolean;
  shopifySignals: string[];
  brandMatch: boolean;
  brandDetail: string;
  productStore: boolean;
  productLinks: number;
  nicheFit: boolean;
  nicheHits: string[];
  /** The home reads like an app / SaaS / service rather than a shop. */
  appLike: boolean;
  title: string;
}

// ── fetching ───────────────────────────────────────────────────────────────
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchHome(url: string, timeoutMs = 12_000): Promise<HomeFetch> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const html = res.ok ? (await res.text()).slice(0, 600_000) : "";
    const out: HomeFetch = { ok: res.ok, status: res.status, finalUrl: res.url, html, headers };
    if (res.ok) {
      try {
        const origin = new URL(res.url).origin;
        const cart = await fetch(`${origin}/cart.js`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
        const j = cart.ok ? await cart.json().catch(() => null) : null;
        out.cartJson = !!j && typeof j === "object" && "items" in j && ("token" in j || "item_count" in j);
      } catch {
        out.cartJson = false;
      }
    }
    return out;
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, html: "", headers: {}, error: (e as Error).message };
  }
}

// ── pure analyzers ─────────────────────────────────────────────────────────
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function detectShopify(f: Pick<HomeFetch, "html" | "headers" | "cartJson">): { shopify: boolean; signals: string[] } {
  const signals: string[] = [];
  const h = f.html;
  if (/cdn\.shopify\.com/i.test(h)) signals.push("cdn.shopify.com");
  if (/\/cdn\/shop\//i.test(h)) signals.push("/cdn/shop/");
  if (/Shopify\.(theme|shop|routes|locale)\b|window\.Shopify\b/.test(h)) signals.push("Shopify JS object");
  if (/shopify-(features|digital-wallet|checkout-api-token)/i.test(h)) signals.push("shopify meta tags");
  if (/\.myshopify\.com/i.test(h)) signals.push("myshopify.com");
  if (f.headers["x-shopid"] || f.headers["x-shopify-stage"] || /shopify/i.test(f.headers["powered-by"] ?? "")) signals.push("Shopify headers");
  if (f.cartJson) signals.push("/cart.js JSON");
  // One weak hint (a stray cdn.shopify.com asset) is not enough: a non-Shopify site can embed one.
  const strong = signals.filter((s) => s !== "cdn.shopify.com" && s !== "myshopify.com");
  return { shopify: strong.length >= 1 || signals.length >= 2, signals };
}

/** "Foo Bar | Skincare" → "foobar"; "The Ordinary" → "ordinary". */
export function brandKey(name: string | null | undefined): string {
  const first = String(name ?? "").split(/\s[|\-–—:]\s|\|/)[0] ?? "";
  return first.toLowerCase().replace(/^the\s+/, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

/** Titles/meta arrive HTML-escaped ("Rothy&#39;s | Shoes &amp; Bags"). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, key: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  return decodeEntities(html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
}

export function pageTitle(html: string): string {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/** Does the home belong to the brand we saved? Compares the brand to title / og:site_name / og:title / domain. */
export function matchBrand(
  html: string,
  savedName: string | null | undefined,
  domain: string | null | undefined,
): { match: boolean; detail: string } {
  const dom = String(domain ?? "").toLowerCase().replace(/^www\./, "").split(".")[0].replace(/[^a-z0-9]/g, "");
  const first = String(savedName ?? "").split(/\s[|\-–—:]\s|\|/)[0];
  // "Athletic Greens (AG1)" is known by either name: try the full name without the parenthesis, and the parenthesis.
  const names = [first.replace(/\(.*?\)/g, " "), ...[...first.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])]
    .map((n) => n.trim())
    .filter(Boolean);
  const titles = [pageTitle(html), metaContent(html, "og:site_name"), metaContent(html, "og:title"), metaContent(html, "application-name")];
  const haystacks = titles.map((t) => t.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const pageWords = new Set(titles.join(" ").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean));
  let tried = false;
  for (const name of names) {
    const key = brandKey(name);
    if (key.length < 3) continue;
    tried = true;
    // every word of the brand appears in the page title ("Sundays for Dogs" ⊂ "Sundays Food for Dogs")
    const words = name.toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter((w) => w.length > 1);
    if (words.length >= 2 && words.every((w) => pageWords.has(w))) return { match: true, detail: "all brand words in the page title" };
    if (haystacks.find((h) => h.includes(key) || (key.length >= 6 && h.length >= 5 && key.includes(h)))) {
      return { match: true, detail: `brand "${key}" found in page title/site name` };
    }
    // The domain label IS the brand (kendrascott.com / "Kendra Scott") and the page did not contradict it
    // with a different, long site name.
    if (dom && (dom === key || dom.includes(key) || key.includes(dom)) && !haystacks.some((h) => h.length >= 12 && !h.includes(dom) && !h.includes(key))) {
      return { match: true, detail: "domain label matches the brand" };
    }
  }
  if (!tried) return { match: false, detail: "no usable brand name saved" };
  return {
    match: false,
    detail: `page says "${(pageTitle(html) || metaContent(html, "og:site_name") || "?").slice(0, 60)}", saved brand is "${String(savedName).slice(0, 40)}"`,
  };
}

export function countProductLinks(html: string): number {
  const set = new Set<string>();
  // Shopify (/products/, /collections/) and the usual non-Shopify catalogue paths (/product/, /shop/, /p/, /pdp/)
  for (const m of html.matchAll(/href=["']([^"']*\/(?:products?|collections|shop|pdp|p|eyeglasses|sunglasses|mattresses|bedding)\/[^"'#?\s]+)/gi)) set.add(m[1]);
  // …or a storefront that adds to cart / bag straight from the home
  const atc = (html.match(/add[- _]to[- _](?:cart|bag|basket)/gi) ?? []).length;
  return Math.max(set.size, atc >= 3 ? atc : 0);
}

/** Keywords that appear on the home of a store in each niche (lowercase, matched on the page text). */
export const NICHE_KEYWORDS: Record<string, string[]> = {
  skincare: ["skin", "serum", "moisturi", "cleanser", "spf", "sunscreen", "retinol", "cream", "face"],
  beauty: ["makeup", "beauty", "lip", "foundation", "mascara", "eyeshadow", "blush", "cosmetic", "skin", "body", "deodorant", "wash", "hair", "nails"],
  fitness: ["workout", "gym", "training", "activewear", "fitness", "yoga", "protein", "running", "athlet"],
  wellness: ["supplement", "vitamin", "probiotic", "wellness", "sleep", "gut", "health", "nutrition", "capsule", "mushroom", "toothbrush", "oral", "dental", "mindful"],
  footwear: ["shoe", "sneaker", "boot", "sandal", "footwear", "loafer", "running"],
  apparel: ["clothing", "shirt", "dress", "jeans", "hoodie", "apparel", "jacket", "pants", "tee", "women", "men"],
  accessories: ["bag", "watch", "jewelry", "jewellery", "necklace", "bracelet", "backpack", "wallet", "sunglasses", "accessor"],
  home: ["home", "furniture", "bedding", "rug", "decor", "kitchen", "candle", "mattress", "sofa", "linen"],
  beverage: ["drink", "coffee", "tea", "beverage", "water", "soda", "juice", "wine", "beer", "kombucha", "spirit", "non-alcoholic", "cocktail", "sparkling", "brew"],
  food: ["snack", "cereal", "sauce", "pantry", "olive oil", "extra virgin", "squeeze", "cooking", "chili", "granola", "chocolate", "jerky", "pasta", "honey", "spice", "protein bar", "recipe", "meal", "groceries", "organic food"],
  eyewear: ["glasses", "eyewear", "frames", "lenses", "sunglasses", "optical"],
  baby: ["baby", "infant", "toddler", "nursery", "diaper", "newborn", "kids", "children", "mama", "mom", "stroller", "car seat", "crib"],
  pet: ["dog", "cat", "pet", "puppy", "treats", "kibble", "paw"],
  grooming: ["shave", "razor", "beard", "grooming", "hair", "cologne", "fragrance", "deodorant", "men"],
};

export function matchNiche(html: string, niche: string | null | undefined): { fit: boolean; hits: string[] } {
  const words = NICHE_KEYWORDS[String(niche ?? "")];
  if (!words) return { fit: false, hits: [] };
  const text = `${pageTitle(html)} ${metaContent(html, "description")} ${metaContent(html, "og:description")} ${textOf(html).slice(0, 12_000)}`.toLowerCase();
  const hits = words.filter((w) => text.includes(w));
  return { fit: hits.length >= 2, hits: hits.slice(0, 6) };
}

const APP_HINTS = [/download (the |our )?app/i, /app store/i, /google play/i, /start (your )?free trial/i, /\b(saas|software)\b/i, /sign up (for )?free/i, /\bmembership\b/i, /subscribe to (our )?(app|plan)/i, /\bmeditat(e|ion)\b/i];
export function looksLikeApp(html: string, productLinks: number): boolean {
  const t = textOf(html).slice(0, 20_000);
  const hits = APP_HINTS.filter((r) => r.test(t)).length;
  return hits >= 2 && productLinks < 6;
}

/** Pure: everything the gate needs, from one fetched home. */
export function analyzeHome(
  f: HomeFetch,
  row: { title: string | null; domain: string | null; niche: string | null },
  via: "fetch" | "browser" = "fetch",
  now: Date = new Date(),
): StoreEvidence {
  const reachable = f.ok && f.html.length > 500;
  const shop = detectShopify(f);
  const brand = matchBrand(f.html, row.title, row.domain);
  const productLinks = countProductLinks(f.html);
  const niche = matchNiche(f.html, row.niche);
  return {
    v: STORE_CHECK_VERSION,
    checkedAt: now.toISOString(),
    via,
    reachable,
    status: f.status,
    shopify: reachable && shop.shopify,
    shopifySignals: shop.signals,
    brandMatch: reachable && brand.match,
    brandDetail: reachable ? brand.detail : f.error ?? `HTTP ${f.status}`,
    productStore: reachable && productLinks >= 3,
    productLinks,
    nicheFit: reachable && niche.fit,
    nicheHits: niche.hits,
    appLike: reachable && looksLikeApp(f.html, productLinks),
    title: pageTitle(f.html).slice(0, 120),
  };
}

export function evidenceIsFresh(e: StoreEvidence | null | undefined, now: number = Date.now()): boolean {
  if (!e || e.v !== STORE_CHECK_VERSION || !e.checkedAt) return false;
  return now - Date.parse(e.checkedAt) <= STORE_CHECK_MAX_AGE_DAYS * 86_400_000;
}

/**
 * The failures that BLOCK publication. "Not verified as Shopify" is deliberately absent: it is a
 * warning (owner decision 2026-10-13) — the card only shows a "Shopify" badge when verified.
 */
export function hardEvidenceFailures(e: StoreEvidence | null | undefined): string[] {
  return evidenceFailures(e).filter((f) => f !== "not verified as a Shopify store");
}

/**
 * Best-fitting niche for a home: the niche with the most distinct keyword hits (≥ 2). Used to RE-ASSIGN
 * a store whose current niche does not fit (e.g. Magic Spoon filed under "beverage" → "food").
 * Returns null when nothing fits.
 */
export function suggestNiche(html: string): { niche: string; hits: string[] } | null {
  let best: { niche: string; hits: string[] } | null = null;
  for (const niche of Object.keys(NICHE_KEYWORDS)) {
    const m = matchNiche(html, niche);
    if (m.fit && (!best || m.hits.length > best.hits.length)) best = { niche, hits: m.hits };
  }
  return best;
}

/** Reasons (in plain words) a piece of evidence fails the "real Shopify store" bar. Empty = passes. */
export function evidenceFailures(e: StoreEvidence | null | undefined): string[] {
  if (!e) return ["store not verified yet"];
  const out: string[] = [];
  if (!e.reachable) {
    out.push(`home unreachable (HTTP ${e.status || "error"})`);
    return out;
  }
  if (!e.shopify) out.push("not verified as a Shopify store");
  if (!e.brandMatch) out.push(`domain does not match the brand (${e.brandDetail})`);
  if (!e.productStore) out.push("no product catalogue found (/products, /collections)");
  if (e.appLike) out.push("looks like an app / service, not a store");
  if (!e.nicheFit) out.push("home content does not fit the niche");
  return out;
}
