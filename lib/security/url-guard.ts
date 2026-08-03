import "server-only";

/**
 * SSRF-safe validation for user-supplied store URLs.
 *
 * The anonymous audit runs against a URL that ANY visitor can submit without an
 * account, and our server (and the screenshot providers) will fetch it. So we
 * must reject anything that could turn the audit into a server-side request
 * forgery vector: non-http(s) schemes, localhost, private/link-local/loopback
 * IP ranges, and bare hostnames that resolve to the metadata service.
 *
 * This is a syntactic guard (scheme + host shape). It intentionally does NOT do
 * DNS resolution — a public hostname could still resolve to a private IP — but
 * the downstream screenshot providers are third-party services that fetch the
 * page from THEIR infrastructure, not ours, which is the primary mitigation.
 * The checks here stop the obvious and cheap attacks and keep junk out of the
 * pipeline.
 */

export type UrlGuardResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/** Hostnames that must never be fetched. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  // Cloud metadata endpoints (AWS/GCP/Azure/DO) by name.
  "metadata",
  "metadata.google.internal",
]);

/** True for an IPv4 literal in a private / loopback / link-local / reserved range. */
function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // malformed → reject
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16 (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved 224.0.0.0/4+
  return false;
}

/** True for an IPv6 literal that is loopback / link-local / unique-local. */
function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:127.0.0.1) — extract and re-check.
  const mapped = h.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/**
 * Validate a raw store URL for the anonymous audit. Returns the normalized
 * absolute URL on success, or a human-readable reason on rejection.
 */
export function validatePublicStoreUrl(raw: string): UrlGuardResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Enter your store URL." };
  if (trimmed.length > 2000) return { ok: false, reason: "That URL is too long." };

  // Add a scheme if the user pasted a bare domain (yourstore.com).
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid URL." };
  }

  // Only real web schemes. Blocks javascript:, data:, file:, ftp:, gopher:, etc.
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Use an http:// or https:// store URL." };
  }

  // No embedded credentials (user:pass@host) — a common SSRF/obfuscation trick.
  if (u.username || u.password) {
    return { ok: false, reason: "Remove the credentials from the URL." };
  }

  const host = u.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "That address can't be audited." };
  }

  // A hostname with no dot (and not an IP) is an internal/short name — reject.
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(":") || u.hostname.startsWith("[");
  if (!isIpv4 && !isIpv6 && !host.includes(".")) {
    return { ok: false, reason: "Enter a full domain, e.g. yourstore.com." };
  }

  if (isIpv4 && isPrivateIpv4(host)) {
    return { ok: false, reason: "Private and local addresses can't be audited." };
  }
  if (isIpv6 && isPrivateIpv6(host)) {
    return { ok: false, reason: "Private and local addresses can't be audited." };
  }

  // `.local` mDNS and single-label internal TLDs.
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return { ok: false, reason: "That address can't be audited." };
  }

  // Canonical form: drop hash, keep it tidy.
  u.hash = "";
  return { ok: true, url: u.toString().replace(/\/$/, "") };
}
