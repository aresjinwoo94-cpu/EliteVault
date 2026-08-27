/**
 * Liquid Blocks WP-F.5 — what the preview browser is allowed to fetch.
 *
 * # Why this is the biggest lever, and the most dangerous one
 * A real storefront pulls hundreds of requests, and most of them have nothing
 * to do with what we measure: analytics beacons, chat widgets, review apps,
 * upsell apps, ad pixels, video. Each costs wall-clock time on a page the
 * merchant is waiting to see.
 *
 * But the product IS the measurement. If blocking a request changes the
 * computed styles, the preview stops being a faithful picture of their store
 * and the whole feature loses its reason to exist. So the rule is asymmetric:
 * when in doubt, ALLOW. A slightly slower preview is a bad day; a preview that
 * quietly reports the wrong accent colour is the failure mode this product was
 * built to replace.
 *
 * # What is never blocked, and why
 *   - `stylesheet` — obviously. Every colour, font stack, radius and width we
 *     read comes from CSS.
 *   - `font` — a face that hasn't loaded reports the fallback stack, so we'd
 *     calibrate against a font the shopper never sees. WP-B already waits on
 *     `document.fonts.ready` for this reason; blocking fonts would defeat it.
 *   - `document`, `xhr`, `fetch`, `script` from the store's OWN origin — a
 *     theme's own JS builds the buy box on plenty of stores, and the buy box is
 *     where the accent colour is read.
 *   - ANY same-origin request. The merchant's own server is not the source of
 *     the bloat, and first-party assets are the ones most likely to matter.
 *
 * # What is blocked
 *   - media (video/audio) — never affects computed style, always heavy.
 *   - third-party scripts and XHR from the known-noisy domains below.
 *   - image/script/xhr from analytics, ads, chat and review widgets.
 *
 * Note what is NOT blocked despite being tempting: third-party images
 * generally, and third-party CSS. Shopify apps inject styles from their own
 * CDNs, and a store's hero image can be on a third-party CDN — both change what
 * the capture looks like.
 */

/** Resource types that can never influence a computed style or the capture. */
const ALWAYS_BLOCKED_TYPES = new Set(["media", "websocket", "eventsource", "manifest"]);

/**
 * Third-party hosts that only ever add weight.
 *
 * Matched as a domain SUFFIX against the request's hostname, so `foo.segment.io`
 * and `segment.io` both match while `mysegment.io` does not — a substring test
 * would block a store whose own domain happened to contain one of these words.
 *
 * Deliberately a list of names rather than a heuristic: "block all third-party
 * scripts" would take out Shopify's own CDN, review apps that inject styles,
 * and app blocks the merchant is paying for and can see on their page.
 */
const NOISY_DOMAINS = [
  // analytics + tag managers
  "google-analytics.com", "googletagmanager.com", "analytics.google.com",
  "segment.io", "segment.com", "amplitude.com", "mixpanel.com",
  "hotjar.com", "hotjar.io", "fullstory.com", "clarity.ms",
  "mouseflow.com", "luckyorange.com", "crazyegg.com", "heap.io",
  "posthog.com", "plausible.io", "matomo.cloud",
  // ad + retargeting pixels
  "facebook.net", "facebook.com", "connect.facebook.net",
  "doubleclick.net", "googlesyndication.com", "googleadservices.com",
  "google.com/ads", "adservice.google.com", "criteo.com", "criteo.net",
  "taboola.com", "outbrain.com", "tiktok.com", "analytics.tiktok.com",
  "snapchat.com", "sc-static.net", "pinterest.com", "pinimg.com/ct",
  "bing.com", "bat.bing.com", "reddit.com", "redditstatic.com",
  "twitter.com", "ads-twitter.com", "linkedin.com", "licdn.com/px",
  // chat + support widgets
  "intercom.io", "intercomcdn.com", "zendesk.com", "zdassets.com",
  "crisp.chat", "tawk.to", "drift.com", "gorgias.chat", "gorgias.com",
  "livechatinc.com", "tidio.co", "hubspot.com", "hs-scripts.com",
  // email / sms marketing
  "klaviyo.com", "attentivemobile.com", "postscript.io", "omnisendapi.com",
  "privy.com", "justuno.com", "mailchimp.com", "listrakbi.com",
  // video
  "youtube.com", "ytimg.com", "vimeo.com", "vimeocdn.com", "wistia.com",
  "wistia.net", "brightcove.com",
  // misc trackers
  "trustpilot.com", "yotpo.com", "okendo.io", "stamped.io",
  "loox.io", "judge.me", "reviews.io", "shopperapproved.com",
];

export interface RequestVerdict {
  block: boolean;
  /** Why, for the log and for anyone auditing the filter later. */
  reason?: string;
}

/** Hostname of a URL, or null when it isn't parseable. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when `host` is `domain` or a subdomain of it — never a substring match. */
function matchesDomain(host: string, domain: string): boolean {
  const d = domain.split("/")[0];
  return host === d || host.endsWith(`.${d}`);
}

export function shouldBlockRequest(req: {
  url: string;
  resourceType: string;
  /** Origin of the page being measured. Same-origin is always allowed. */
  pageOrigin: string;
}): RequestVerdict {
  const host = hostOf(req.url);
  if (!host) return { block: false };

  // `data:` and `blob:` are already in the page; nothing to save by blocking.
  if (req.url.startsWith("data:") || req.url.startsWith("blob:")) {
    return { block: false };
  }

  /**
   * TYPE FIRST, ORIGIN SECOND — and the order is load-bearing.
   *
   * Video, audio, websockets and manifests cannot influence a computed style
   * whoever serves them, so first-party is not a reason to keep them. A store's
   * own hero video is often the single heaviest thing on the page, and blocking
   * it costs us the moving image while the poster frame — an `image`, not
   * `media` — still renders in the capture.
   *
   * The first draft had these the other way round, so a first-party .mp4 was
   * allowed through by the origin check before the type check ever ran. The
   * test caught it.
   */
  if (ALWAYS_BLOCKED_TYPES.has(req.resourceType)) {
    return { block: true, reason: `type:${req.resourceType}` };
  }

  /**
   * FIRST-PARTY IS ALWAYS ALLOWED, for everything else.
   *
   * Checked before the domain list, deliberately. A merchant's own domain can
   * contain one of the noisy names, and their own server is not where the bloat
   * comes from — but it IS where the theme, its CSS and its buy box come from.
   * Getting this backwards would break the measurement on exactly the stores
   * hardest to debug.
   */
  const pageHost = hostOf(req.pageOrigin);
  if (pageHost && (host === pageHost || host.endsWith(`.${pageHost}`))) {
    return { block: false };
  }

  /**
   * Stylesheets and fonts are never blocked, from anywhere.
   *
   * This is the line that keeps the preview honest. Shopify apps and font CDNs
   * both serve from third-party hosts, and either one changes what the shopper
   * sees — so neither may be dropped for speed, even from a domain on the noisy
   * list. The cost is a few requests; the alternative is a preview that reports
   * a typeface the store doesn't use.
   */
  if (req.resourceType === "stylesheet" || req.resourceType === "font") {
    return { block: false };
  }

  for (const domain of NOISY_DOMAINS) {
    if (matchesDomain(host, domain)) {
      return { block: true, reason: `domain:${domain}` };
    }
  }

  // Anything else third-party is allowed. When in doubt the preview's fidelity
  // wins over its speed — see the header.
  return { block: false };
}

/** Exported for the test that proves the list is matched by domain, not substring. */
export const __NOISY_DOMAINS = NOISY_DOMAINS;
