import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase Auth OAuth + magic-link callback.
 * Exchanges the code in the URL for a session, then redirects to `next`.
 *
 * Common failure modes (all surfaced in the error message now so you see
 * the actual cause instead of a generic "could not sign you in"):
 *   • `code_verifier missing` — PKCE cookie didn't survive the OAuth
 *     redirect. Usually caused by the user's browser blocking 3rd-party
 *     cookies for the Supabase domain.
 *   • `invalid_grant` — the code was already exchanged or expired.
 *   • `Error fetching user` — Google returned a token but user lookup
 *     failed (rare).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errParam = searchParams.get("error");
  const errDesc = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/app";

  // Google sent us an error directly (user denied, etc.)
  if (errParam) {
    console.warn("[auth callback] OAuth error", errParam, errDesc);
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(
        errDesc ?? errParam,
      )}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?message=${encodeURIComponent(
        "Missing authorization code from the OAuth provider.",
      )}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Surface the REAL error so we (and the user) know what to fix.
  console.error("[auth callback] exchange failed:", error);
  return NextResponse.redirect(
    `${origin}/sign-in?message=${encodeURIComponent(
      `Sign-in failed: ${error.message}`,
    )}`,
  );
}
