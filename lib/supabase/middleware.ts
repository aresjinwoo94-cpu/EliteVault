import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type Database } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Middleware session refresh + route gating.
 *
 * v3.8.2 — fixed the "works once but not subsequent times" auth bug.
 *
 * Background
 * Supabase's SSR client calls our `setAll` callback whenever it has new
 * cookies to write (typically when refreshing an access token). If
 * middleware then creates a FRESH NextResponse.redirect() to bounce the
 * user somewhere, those Supabase-set cookies are NOT automatically copied
 * to the redirect — they live on the supabaseResponse we never returned.
 *
 * Symptom: user signs in, session works for the first navigation, then
 * mid-flow the access token expires, Supabase tries to refresh during
 * middleware, succeeds, sets new cookies on supabaseResponse, but then
 * the middleware ALSO redirects (e.g. bounce-from-/sign-in-to-/app), the
 * redirect response has no Set-Cookie headers, browser is left with the
 * stale expired cookie, next request looks like "not signed in" → loop.
 *
 * Fix
 * Every redirect we return copies supabaseResponse.cookies.getAll() onto
 * itself first. The Supabase docs are explicit about this — "If you're
 * creating a new response object, copy the cookies over."
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (request.nextUrl.pathname.startsWith("/app")) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set(
        "message",
        "Supabase isn't configured. Add NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
      );
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // First: update the in-memory request cookies so anything reading
          // them later in this same request sees the refreshed values.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Then: rebuild supabaseResponse and write each cookie to it with
          // a long maxAge + Lax SameSite. The 30-day TTL lets sessions
          // survive the Stripe checkout round-trip (3-5 min on the Stripe
          // domain). Without an explicit maxAge the SDK can default to
          // session-only, which is cleared the moment the tab closes.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? 60 * 60 * 24 * 30,
              sameSite: options?.sameSite ?? "lax",
            });
          });
        },
      },
    },
  );

  // IMPORTANT: do NOT remove this line and do NOT add logic between
  // createServerClient and this call. Per Supabase docs, that combo is
  // what makes "users randomly get logged out" bugs go away.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isApp = path.startsWith("/app");
  const isAuth = path.startsWith("/sign-in") || path.startsWith("/sign-up");

  // Helper — when we issue a redirect, copy over any cookies Supabase
  // wrote to supabaseResponse during the getUser() refresh. Without
  // this, refreshes done mid-redirect get DROPPED and the user's
  // session looks stale on the next request.
  const redirectPreservingCookies = (url: URL): NextResponse => {
    const r = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      // Re-apply each cookie to the redirect response with the same
      // attributes we wrote earlier.
      r.cookies.set(c.name, c.value, {
        path: c.path,
        domain: c.domain,
        maxAge: c.maxAge,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      });
    });
    return r;
  };

  if (isApp && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return redirectPreservingCookies(url);
  }

  if (isAuth && user) {
    const url = request.nextUrl.clone();
    const explicitNext = request.nextUrl.searchParams.get("next");
    url.pathname =
      explicitNext && explicitNext.startsWith("/app")
        ? explicitNext
        : "/app/analyzer";
    url.search = "";
    return redirectPreservingCookies(url);
  }

  return supabaseResponse;
}
