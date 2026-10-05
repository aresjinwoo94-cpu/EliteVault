import { cookies, headers } from "next/headers";
import { QA_LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from "./config";
import { detectLocale } from "./detect";
import { autoLocaleEnabled } from "@/lib/flags";
import { translator } from "./messages";

/**
 * Server-side locale read — the site's language for this request.
 *
 *  1. QA override (no UI): `?lang=en|es` is turned into the session cookie
 *     `EV_LANG_QA` by middleware.ts; when present it wins, flag or not.
 *  2. `AUTO_LOCALE` OFF → English (the default locale).
 *  3. `AUTO_LOCALE` ON → detectLocale() from `x-vercel-ip-country` +
 *     `accept-language`.
 *
 * The old `NEXT_LOCALE` cookie (set by the removed EN/ES button) is ignored on
 * purpose: those visitors get the automatic language like everyone else.
 *
 * Reading cookies/headers keeps the route dynamic — it already was (the root
 * layout read the NEXT_LOCALE cookie before), so nothing becomes dynamic that
 * wasn't.
 */
export async function getLocale(): Promise<Locale> {
  const [store, hdrs] = await Promise.all([cookies(), headers()]);
  const qa = store.get(QA_LOCALE_COOKIE)?.value;
  if (isLocale(qa)) return qa;
  if (!autoLocaleEnabled()) return defaultLocale;
  return detectLocale({
    country: hdrs.get("x-vercel-ip-country"),
    acceptLanguage: hdrs.get("accept-language"),
  });
}

/** `{ locale, t }` for use in async Server Components. */
export async function getT(): Promise<{
  locale: Locale;
  t: (path: string) => string;
}> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
