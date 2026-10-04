import { defaultLocale, type Locale } from "./config";

/**
 * Countries whose visitors we default to Spanish (ISO 3166-1 alpha-2, as sent
 * in Vercel's `x-vercel-ip-country`).
 */
export const SPANISH_COUNTRIES: ReadonlySet<string> = new Set([
  "ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO",
  "HN", "PY", "SV", "NI", "CR", "PA", "UY", "PR", "GQ",
]);

/** Language tags of an Accept-Language header, best first (q-weighted, stable). */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isNaN(weight) ? 0 : weight, index };
    })
    .filter((l) => l.tag && l.tag !== "*" && l.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .map((l) => l.tag);
}

const isSpanishTag = (tag: string) => tag === "es" || tag.startsWith("es-");

/**
 * The site's language for a visitor.
 *
 *  • IP country is Spanish-speaking → Spanish, UNLESS the browser lists no
 *    `es*` language at all (a visitor who does not read Spanish → English).
 *  • Any other country → English, UNLESS the browser's FIRST language is `es*`
 *    (e.g. Spanish speakers in the US).
 *  • No headers (local dev, bots) → English.
 */
export function detectLocale({
  country,
  acceptLanguage,
}: {
  country?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  const langs = parseAcceptLanguage(acceptLanguage);
  const code = country?.trim().toUpperCase() ?? "";

  if (code && SPANISH_COUNTRIES.has(code)) {
    // No Accept-Language at all → trust the country.
    if (langs.length === 0) return "es";
    return langs.some(isSpanishTag) ? "es" : "en";
  }
  if (langs.length > 0 && isSpanishTag(langs[0])) return "es";
  return defaultLocale;
}
