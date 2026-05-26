import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { type Database } from "./types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Run in middleware to refresh the Supabase session cookie on every request.
 * Without this, Server Components can be served with stale auth state.
 *
 * If Supabase isn't configured yet (first `npm run dev` without .env.local)
 * we skip auth entirely so the public landing page still renders. Protected
 * routes will then fail loudly inside their own page handlers.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
    return response;
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do NOT remove this line. It refreshes the session.
  const { data: { user } } = await supabase.auth.getUser();

  // Gate the /app prefix.
  const path = request.nextUrl.pathname;
  const isApp = path.startsWith("/app");
  const isAuth = path.startsWith("/sign-in") || path.startsWith("/sign-up");

  if (isApp && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // If a logged-in user lands on /sign-in or /sign-up, bounce them into
  // the app. Default target is /app/analyzer (matches the post-auth
  // default elsewhere in the codebase — see app/actions/auth.ts). If
  // the URL carried an explicit ?next= (e.g. they clicked a deep link
  // that hit auth first), honor that instead.
  if (isAuth && user) {
    const url = request.nextUrl.clone();
    const explicitNext = request.nextUrl.searchParams.get("next");
    url.pathname = explicitNext && explicitNext.startsWith("/app")
      ? explicitNext
      : "/app/analyzer";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
