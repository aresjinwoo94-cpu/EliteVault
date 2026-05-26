import type { MetadataRoute } from "next";

/**
 * Dynamic robots.txt at /robots.txt
 *
 * Tells crawlers which routes to index and which to skip. We intentionally
 * disallow:
 *   • /api/* — never index our endpoints
 *   • /app/* — the authenticated dashboard (would be empty for crawlers
 *     anyway since RLS blocks unauth requests, but explicit > implicit)
 *   • /sign-in, /sign-up, /auth/* — auth screens
 *
 * Everything else (landing, /pricing, /community/*) is fair game.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevault.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/app/", "/sign-in", "/sign-up", "/auth/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
