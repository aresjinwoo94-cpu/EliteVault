import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type Database } from "./types";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Use this in Server Components, Server Actions and Route Handlers.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
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
