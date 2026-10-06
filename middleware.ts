import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { QA_LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

export async function middleware(request: NextRequest) {
  // QA override (no UI): ?lang=en|es → 1-year cookie that beats the automatic
  // language (lib/i18n/server.ts). Set on the request too so THIS render sees it.
  const lang = request.nextUrl.searchParams.get("lang");
  const qa = isLocale(lang) ? lang : null;
  if (qa) request.cookies.set(QA_LOCALE_COOKIE, qa);

  // The blog is English-only content: pin its chrome (nav, footer, <html lang>)
  // to English so a Spanish-country visitor or crawler never gets a Spanish
  // shell around English copy. Request-scoped only — no cookie is persisted.
  const { pathname } = request.nextUrl;
  if (pathname === "/blog" || pathname.startsWith("/blog/")) {
    request.cookies.set(QA_LOCALE_COOKIE, "en");
  }

  const response = await updateSession(request);
  if (qa) response.cookies.set(QA_LOCALE_COOKIE, qa, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return response;
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
