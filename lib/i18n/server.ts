import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  defaultLocale,
  isLocale,
  type Locale,
} from "./config";
import { translator } from "./messages";

/**
 * Server-side locale read. Reading the cookie here opts the route into
 * dynamic rendering — acceptable trade-off for correct SSR language (no
 * English flash before hydration, correct <html lang>).
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** `{ locale, t }` for use in async Server Components. */
export async function getT(): Promise<{
  locale: Locale;
  t: (path: string) => string;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
