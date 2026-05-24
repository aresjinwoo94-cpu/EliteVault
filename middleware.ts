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
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|api/inngest|api/stripe/webhook).*)",
  ],
};
