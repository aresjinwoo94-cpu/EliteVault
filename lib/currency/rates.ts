import fallback from "./fallback-rates.json";

export type UsdRates = Record<string, number>;

const SOURCE = "https://open.er-api.com/v6/latest/USD";
const TIMEOUT_MS = 1500;
const REVALIDATE_SECONDS = 43200; // 12h

/** Keeps only finite, positive rates keyed by a 3-letter code. */
export function sanitizeRates(raw: unknown): UsdRates | null {
  if (!raw || typeof raw !== "object") return null;
  const out: UsdRates = {};
  for (const [code, rate] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(code) && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      out[code] = rate;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const fallbackRates: UsdRates = sanitizeRates(fallback.rates) ?? { USD: 1 };

/**
 * Foreign-exchange rates per 1 USD, one source, cached 12h by Next's data
 * cache. Hard 1.5s timeout; on ANY failure (network, status, bad payload) the
 * committed snapshot is returned, so a rates problem can never break or delay
 * a page. `fetchImpl` is injectable for tests.
 */
export async function getUsdRates(fetchImpl: typeof fetch = fetch): Promise<UsdRates> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(SOURCE, {
      signal: controller.signal,
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return fallbackRates;
    const body = (await res.json()) as { result?: string; rates?: unknown };
    if (body.result !== "success") return fallbackRates;
    const live = sanitizeRates(body.rates);
    return live ? { ...fallbackRates, ...live, USD: 1 } : fallbackRates;
  } catch {
    return fallbackRates;
  } finally {
    clearTimeout(timer);
  }
}
