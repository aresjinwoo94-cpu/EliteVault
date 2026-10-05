import { cookies, headers } from "next/headers";
import { QA_LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from "./config";
import { detectLocale } from "./detect";
import { autoLocaleEnabled } from "@/lib/flags";
import { translator } from "./messages";

/** Supabase auth cookie present (chunked or not) — cheap "might be logged in". */
const AUTH_COOKIE = /^sb-.+-auth-token/;

function ownerEmails(): string[] {
  return (process.env.ADMIN_EMAILS || process.env.INTERNAL_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The owner always sees the site in English, wherever they are. Only checked
 * when the owner list is set AND a session cookie exists, so anonymous page
 * loads never pay for a Supabase call.
 */
async function isOwnerSession(store: Awaited<ReturnType<typeof cookies>>): Promise<boolean> {
  const list = ownerEmails();
  if (list.length === 0) return false;
  if (!store.getAll().some((c) => AUTH_COOKIE.test(c.name))) return false;
  try {
    const { getUserResult } = await import("@/lib/supabase/server");
    const { user } = await getUserResult();
    const email = user?.email?.toLowerCase();
    return !!email && list.includes(email);
  } catch {
    return false;
  }
}

/**
 * Server-side locale read — the site's language for this request.
 *
 *  1. QA override (no UI): `?lang=en|es` is turned into the session cookie
 *     `EV_LANG_QA` by middleware.ts; when present it wins, flag or not.
 *  2. The owner (ADMIN_EMAILS / INTERNAL_EMAILS) always gets English.
 *  3. `AUTO_LOCALE` OFF → English (the default locale).
 *  4. `AUTO_LOCALE` ON → detectLocale() from `x-vercel-ip-country` +
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
  if (await isOwnerSession(store)) return "en";
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
