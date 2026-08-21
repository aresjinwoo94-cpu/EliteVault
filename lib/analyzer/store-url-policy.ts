/**
 * Product-level rules about what is worth auditing — distinct from
 * lib/security/url-guard.ts, which answers "is this safe to fetch?".
 *
 * The security guard already blocks private ranges, loopback and metadata
 * addresses. What it deliberately allows is a PUBLIC bare IP, because fetching
 * one is not an SSRF risk. That is the right call for a security guard and the
 * wrong answer for this product: an ecommerce storefront is never a bare IP.
 *
 * Measured cost of not having this rule: over 14 days, 1-3 audits a day arrived
 * as bare public IPs (61.45.236.192, 49.248.161.6, 53.113.91.101, …). Each was
 * charged a credit, queued, and then spent 130-207s failing through the whole
 * capture chain and Inngest's retry ladder before refunding. The user waited
 * three minutes to be told what a hostname check knew immediately.
 */

/**
 * True when the URL's host is a bare IP literal rather than a domain.
 *
 * Only reachable for PUBLIC addresses — the SSRF guard rejects private ones
 * before this is consulted, and this must never be relied on for that.
 */
export function isBareIpHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  // IPv6 literals arrive bracketed from URL.hostname on some runtimes.
  const bare = host.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true;
  // An IPv6 literal always contains a colon; a hostname never does.
  return bare.includes(":");
}

/**
 * The user-facing reason. Deliberately not phrased as a security refusal —
 * nothing unsafe happened, the address just can't be a store.
 */
export const BARE_IP_REASON =
  "That's an IP address, not a store. Enter the domain you'd give a customer, e.g. yourstore.com.";
