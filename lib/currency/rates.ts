import fallback from "./fallback-rates.json";

export type UsdRates = Record<string, number>;

const SOURCE = "https://open.er-api.com/v6/latest/USD";
const TIMEOUT_MS = 1500;
const REVALIDATE_SECONDS = 43200; // 12h
/** After a failed/slow fetch, skip the network for this long (per instance). */
const COOLDOWN_MS = 60_000;
let failedAt = 0;

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

/** Test hook: clears the circuit breaker. */
export function resetRatesCooldown(): void {
  failedAt = 0;
}

export const fallbackRates: UsdRates = sanitizeRates(fallback.rates) ?? { USD: 1 };

/**
 * Foreign-exchange rates per 1 USD, one source, cached 12h by Next's data
 * cache. Hard 1.5s timeout; on ANY failure (network, status, bad payload) the
 * committed snapshot is returned, so a rates problem can never break or delay
 * a page. `fetchImpl` is injectable for tests.
 */
export async function getUsdRates(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<UsdRates> {
  // Circuit breaker: while the source is failing, don't make every request
  // wait the full timeout — serve the snapshot until the cooldown ends.
  if (failedAt && now() - failedAt < COOLDOWN_MS) return fallbackRates;
  const fail = () => {
    failedAt = now();
    return fallbackRates;
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(SOURCE, {
      signal: controller.signal,
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return fail();
    const body = (await res.json()) as { result?: string; rates?: unknown };
    if (body.result !== "success") return fail();
    const live = sanitizeRates(body.rates);
    if (!live) return fail();
    failedAt = 0;
    return { ...fallbackRates, ...live, USD: 1 };
  } catch {
    return fail();
  } finally {
    clearTimeout(timer);
  }
}
