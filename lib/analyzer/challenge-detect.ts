/**
 * WP-A layer 1 — recognise an anti-bot verification page from raw HTML.
 *
 * The audit's failure mode this exists to stop: a store behind Cloudflare
 * serves an interstitial ("Checking your browser…") instead of the shop. That
 * interstitial screenshots perfectly — normal size, cleanly rendered — so
 * `isLikelyPlaceholder` in screenshot-core.ts waves it through, and the vision
 * model then writes a confident CRO audit of a security page. On
 * brilliantearth.com that produced findings like "Cloudflare bot verification
 * blocks visitors instantly" presented as discoveries about the store.
 *
 * The HTML `discoverSite()` already fetches is the best possible detector: it's
 * a plain fetch with no JS, which is precisely the request most likely to be
 * challenged. So this costs nothing — no extra request, no AI call.
 *
 * Pure function, no I/O, so a false positive is cheap to reason about and cheap
 * to test.
 */

export interface ChallengeDetection {
  detected: boolean;
  /** Best guess at the vendor, for logs and copy. Null when unattributed. */
  vendor: string | null;
}

/**
 * Signatures that only ever appear on a challenge page. Vendor challenge
 * infrastructure isn't shipped on a normal storefront, so a hit here is
 * conclusive on its own.
 */
const STRONG: ReadonlyArray<readonly [RegExp, string]> = [
  [/cf-browser-verification/i, "Cloudflare"],
  [/cdn-cgi\/challenge-platform/i, "Cloudflare"],
  [/__cf_chl_/i, "Cloudflare"],
  [/<title>\s*just a moment[.\s…]*<\/title>/i, "Cloudflare"],
  [/attention required!\s*\|\s*cloudflare/i, "Cloudflare"],
  [/checking your browser before accessing/i, "Cloudflare"],
  [/_incapsula_resource/i, "Imperva Incapsula"],
  [/distil_r_captcha/i, "Distil"],
  [/px-captcha/i, "PerimeterX"],
  [/geo\.captcha-delivery\.com/i, "DataDome"],
  [/performing security verification/i, null as unknown as string],
];

/**
 * Signatures that are ONLY meaningful on an otherwise-empty page.
 *
 * reCAPTCHA and hCaptcha are everywhere — contact forms, newsletter signups,
 * login boxes — so treating them as conclusive would mark healthy stores as
 * blocked, which is a far worse failure than missing a challenge: it would
 * refuse to audit a store we can actually see. They count only when the page
 * has essentially no other content, i.e. the captcha IS the page.
 */
const WEAK: ReadonlyArray<readonly [RegExp, string]> = [
  [/g-recaptcha/i, "reCAPTCHA"],
  [/h-captcha|hcaptcha\.com/i, "hCaptcha"],
];

/**
 * Below this many characters of visible text, a page has nothing a shopper
 * could read — no product copy, no nav, no footer. A real storefront clears it
 * by an order of magnitude; a challenge page is a heading and a spinner.
 */
const THIN_PAGE_CHARS = 1_000;

/** Visible-text length, ignoring markup, scripts and styles. */
function visibleTextLength(html: string): number {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function detectChallenge(html: string): ChallengeDetection {
  if (!html) return { detected: false, vendor: null };

  for (const [re, vendor] of STRONG) {
    if (re.test(html)) return { detected: true, vendor: vendor ?? null };
  }

  if (visibleTextLength(html) < THIN_PAGE_CHARS) {
    for (const [re, vendor] of WEAK) {
      if (re.test(html)) return { detected: true, vendor };
    }
  }

  return { detected: false, vendor: null };
}

/**
 * An HTTP status that, on its own, says the fetch was refused rather than
 * served. Used only to ATTRIBUTE an already-detected challenge — never to
 * declare one, because plenty of healthy stores answer 403 to a bot user-agent
 * while serving browsers (and the real screenshot providers) perfectly well.
 */
export function isRefusedStatus(status: number): boolean {
  return status === 403 || status === 429 || status === 503;
}

/**
 * Reconcile the two WP-A layers into one answer.
 *
 * **Layer 2 wins whenever it spoke.** Discovery's pre-check only sees what a
 * plain, JS-less fetch received; the capture providers drive real browsers and
 * routinely clear a challenge that pre-check tripped on. The model is the only
 * party that saw the pixels the audit was actually written from, so when it
 * says the capture was fine, a layer-1 hit is a stale worry — not a veto.
 *
 * Layer 1 still matters on its own: an older analysis (stored before the schema
 * field existed) or a generation that omitted the field leaves layer 2 silent,
 * and a challenge we detected is better than no explanation at all.
 */
export function resolveCaptureBlocked(input: {
  /** The model's verdict, from AnalysisResult.capture_blocked. */
  fromModel?: { detected?: boolean; reason?: string | null } | null;
  /** The pre-check, from the persisted discovery_signals. */
  fromDiscovery?: { challengeDetected?: boolean; challengeVendor?: string | null } | null;
}): { blocked: boolean; reason: string | null; vendor: string | null } {
  const vendor = input.fromDiscovery?.challengeVendor ?? null;

  if (typeof input.fromModel?.detected === "boolean") {
    return {
      blocked: input.fromModel.detected,
      reason: input.fromModel.detected ? (input.fromModel.reason ?? null) : null,
      vendor: input.fromModel.detected ? vendor : null,
    };
  }

  const blocked = input.fromDiscovery?.challengeDetected === true;
  return { blocked, reason: null, vendor: blocked ? vendor : null };
}
