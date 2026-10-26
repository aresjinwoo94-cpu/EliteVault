/**
 * Keep claim tokens out of analytics. A claim link is `/s/<slug>?c=<token>`, and the sign-up round trip carries it
 * encoded in `next` (`%3Fc%3D<token>`). The token is a bearer secret until used, so no URL that reaches PostHog
 * (pageviews, $pageleave, recordings, referrers) may contain it.
 */
const TOKEN = "[A-Za-z0-9_-]{43}";
const PLAIN = new RegExp(`([?&]c=)${TOKEN}`, "g");
const ENCODED = new RegExp(`((?:%3F|%26)c%3D)${TOKEN}`, "gi");

export function redactClaimToken(s: string): string {
  return s.replace(PLAIN, "$1[redacted]").replace(ENCODED, "$1[redacted]");
}

/** Redacts every string property of a PostHog event (shallow + one level of arrays). */
export function redactEventProperties<T extends Record<string, unknown>>(props: T): T {
  const out: Record<string, unknown> = { ...props };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string") out[k] = redactClaimToken(v);
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? redactClaimToken(x) : x));
  }
  return out as T;
}
