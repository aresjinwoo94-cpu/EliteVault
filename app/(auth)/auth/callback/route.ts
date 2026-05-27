import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth callback — OAuth code exchange + magic-link OTP redirect.
 *
 * v3.8.1 — REWRITTEN to write cookies directly to the NextResponse object.
 *
 * Previous bug: the route used `createSupabaseServerClient()` (the same
 * helper that Server Components use), which writes cookies via Next.js's
 * `cookies()` API. In a Route Handler that returns a redirect, those
 * cookie writes don't make it to the actual response sent to the browser.
 * Net effect: exchangeCodeForSession() succeeded server-side, but the
 * session cookie was never set in the user's browser → next request to
 * /app/analyzer had no auth → middleware bounced to /sign-in → user got
 * stuck (magic-link OTPs are single-use, so they couldn't retry without
 * waiting for the 60s rate limit).
 *
 * The fix: build the redirect response FIRST, then create a Supabase
 * client whose cookie writes target THAT response's cookie jar. When
 * we return the response, the Set-Cookie headers go with it.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const errParam = searchParams.get("error");
  const errDesc = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/app/analyzer";

  // Resolve the user-visible origin. On Vercel the request hits an internal
  // proxy, so request.url's origin can be a private hostname. The public
  // domain is in `x-forwarded-host` + `x-forwarded-proto`.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : new URL(request.url).origin;

  // Provider returned an error before code exchange (user denied, etc.)
  if (errParam) {
    console.warn("[auth callback] OAuth error", errParam, errDesc);
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(errDesc ?? errParam)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(
        "Missing authorization code. Try signing in again.",
      )}`,
    );
  }

  // Build the success redirect FIRST so we can write cookies to it.
  // If the exchange fails we'll discard this and return an error redirect.
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // 30-day cookie so the session survives long Stripe checkout
            // flows and idle periods. Matches the lib/supabase/middleware.ts
            // pattern.
            response.cookies.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? 60 * 60 * 24 * 30,
              sameSite: options?.sameSite ?? "lax",
            });
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth callback] exchange failed:", error);
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(
        `Sign-in failed: ${error.message}`,
      )}`,
    );
  }

  // Success — return the response we built earlier (with session cookies
  // attached by the setAll callback above).
  return response;
}
