import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static (static files)
     *   - _next/image  (image optimization)
     *   - favicon, manifest, etc.
     *   - api/inngest, api/stripe/webhook (must bypass auth)
     *   - auth/callback (v3.9.1: callback writes its own session, the
     *     middleware getUser() call here is wasted ~300ms — there's no
     *     session to refresh because it hasn't been created yet)
     *   - api/me, api/analyses/*, api/meta-simulations/* (these handlers
     *     do their own auth check; middleware getUser is redundant)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|api/inngest|api/stripe/webhook|auth/callback).*)",
  ],
};
