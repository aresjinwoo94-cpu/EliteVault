import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { CookiesToSet } from "@/lib/supabase/types";

// v3.9.1 — edge runtime kills cold-start latency on the auth callback.
// Node functions on Vercel can cold-start at 500-1000ms; edge starts
// at ~50ms. The callback runs exactly once per sign-in, so even small
// gains here are noticeable in the user-perceived "click link → logged
// in" delay.
export const runtime = "edge";

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
  // Token-hash flow (Supabase SSR recommended for email links). Unlike the
  // PKCE `code`, a token_hash is self-contained — it doesn't depend on the
  // single code-verifier cookie that a newer sign-in request overwrites, so
  // an earlier email's link keeps working. Activated by pointing the Supabase
  // magic-link email template at ...?token_hash={{ .TokenHash }}&type=email.
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type") as EmailOtpType | null;
  const errParam = searchParams.get("error");
  const errDesc = searchParams.get("error_description");
  // Only accept SAME-ORIGIN relative paths for `next`. Without this guard,
  // `${origin}${next}` (used below for the post-auth redirect) is an open
  // redirect: e.g. next=".evil.com" would build
  // "https://elitevaultapp.com.evil.com" — a phishing host. Require a single
  // leading slash and reject protocol-relative ("//host") or backslash tricks.
  const rawNext = searchParams.get("next") ?? "/app/analyzer";
  const next =
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/\\")
      ? rawNext
      : "/app/analyzer";

  // Diagnostic logging — surfaces every hop in the auth flow so we can
  // pinpoint where the session is getting dropped. Vercel logs surface
  // these in the Functions tab.
  console.log("[auth/callback] hit", {
    url: request.url,
    hasCode: !!code,
    codePrefix: code?.slice(0, 8) ?? null,
    errParam,
    next,
    referer: request.headers.get("referer"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    incomingCookies: request.cookies
      .getAll()
      .map((c) => c.name)
      .filter((n) => n.startsWith("sb-")),
  });

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

  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(
        "Missing authorization code. Try signing in again.",
      )}`,
    );
  }

  // Build the success redirect FIRST so we can write cookies to it.
  // If the exchange fails we'll discard this and return an error redirect.
  const response = NextResponse.redirect(`${origin}${next}`);

  let cookiesWritten = 0;
  const cookieNamesWritten: string[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? 60 * 60 * 24 * 30,
              sameSite: options?.sameSite ?? "lax",
            });
            cookiesWritten++;
            cookieNamesWritten.push(name);
          });
        },
      },
    },
  );

  // Prefer the token-hash flow when present (self-contained, survives a newer
  // sign-in request); otherwise fall back to the PKCE code exchange. Keeping
  // both means older `code` links AND newer token_hash links both work — a
  // safe, no-flag-day migration.
  const { data, error } =
    tokenHash && otpType
      ? await supabase.auth.verifyOtp({ type: otpType, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!);

  console.log("[auth/callback] exchange result", {
    flow: tokenHash ? "token_hash" : "pkce",
    ok: !error,
    error: error?.message ?? null,
    userId: data?.user?.id ?? null,
    cookiesWritten,
    cookieNamesWritten,
    redirectTo: `${origin}${next}`,
  });

  if (error) {
    console.error("[auth callback] verify failed:", error.message);
    // Used/expired links are the common case (single-use OTP, or an older
    // email clicked after a newer link was requested). Give a clear recovery
    // message instead of a raw error, and keep `next` so the fresh link lands
    // back where they intended.
    const msg = /expired|invalid|not found|used|otp/i.test(error.message)
      ? "That sign-in link has already been used or expired. Enter your email to get a fresh one — always open the most recent EliteVault email."
      : `Sign-in failed: ${error.message}`;
    return NextResponse.redirect(
      `${origin}/sign-in?next=${encodeURIComponent(next)}&message=${encodeURIComponent(msg)}`,
    );
  }

  // Sanity check — if cookies weren't actually written, the session won't
  // survive the redirect. Bail out with a clear error so we don't loop.
  if (cookiesWritten === 0) {
    console.error("[auth/callback] exchange succeeded but 0 cookies written!");
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(
        "Session cookies failed to set. Try a different browser or disable extensions.",
      )}`,
    );
  }

  // Success — return the response we built earlier (with session cookies
  // attached by the setAll callback above).
  return response;
}
