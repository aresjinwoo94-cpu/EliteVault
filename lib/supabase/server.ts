import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { type Database, type CookiesToSet } from "./types";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Use this in Server Components, Server Actions and Route Handlers.
 */
async function buildSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions),
            );
          } catch {
            // Setting cookies from a Server Component throws — that's expected
            // and handled by middleware which refreshes the session.
          }
        },
      },
    },
  );
}

/**
 * One server client per request (React `cache`): the root layout, the (app)
 * layout and the page all ask for it and now share a single instance.
 */
export const createSupabaseServerClient = cache(buildSupabaseServerClient);

/**
 * The authenticated user, verified with Supabase Auth ONCE per request.
 *
 * `auth.getUser()` is a network round-trip to Supabase. The middleware
 * refreshes the session, then app/(app)/layout.tsx AND the page each used to
 * make their own call — 2-3 identical round-trips per navigation. Server
 * Components that need the user call this instead: same result shape as
 * `supabase.auth.getUser()`, same server-side verification (it is NOT a cookie
 * decode), shared within the request.
 */
export const getUserResult = cache(async () => {
  const supabase = await createSupabaseServerClient();
  return supabase.auth.getUser();
});

/**
 * Service-role client. NEVER expose this to the browser.
 * Used by webhooks and Inngest functions to bypass RLS.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
