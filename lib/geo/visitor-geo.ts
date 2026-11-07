/**
 * Where the visitor is, from whichever edge sits in front of the app:
 *   • Vercel      → `x-vercel-ip-country` / `x-vercel-ip-city` (city is URL-encoded)
 *   • Cloudflare  → `cf-ipcountry` / `cf-ipcity` (city needs the "Add visitor location headers"
 *                   managed transform; the country header is always sent when proxied)
 * Cloud Run alone sends neither, so without this every visitor looked like "unknown → USD, English".
 *
 * Display-only (language, currency, analytics): nothing here gates access or money.
 */
type HeaderBag = { get(name: string): string | null };

/** ISO 3166-1 alpha-2, upper-case; null for unknown ("XX"), Tor ("T1") or malformed values. */
export function visitorCountry(h: HeaderBag): string | null {
  const raw = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
  const c = raw?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

export function visitorCity(h: HeaderBag): string | null {
  const raw = h.get("x-vercel-ip-city") ?? h.get("cf-ipcity");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
