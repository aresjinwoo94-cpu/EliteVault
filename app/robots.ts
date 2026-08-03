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
    process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

  // /audit/* are per-session anonymous audit result pages (also noindex via
  // page metadata) — never index them.
  const disallow = ["/api/", "/app/", "/audit/", "/sign-in", "/sign-up", "/auth/"];

  // Explicitly WELCOME the major AI/answer-engine crawlers (GEO): being
  // crawlable by these is how EliteVault can show up in ChatGPT, Gemini,
  // Perplexity, Claude, etc. answers. Same public/private split as everyone.
  const aiCrawlers = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "anthropic-ai",
    "Claude-Web",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Applebot-Extended",
    "cohere-ai",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: aiCrawlers, allow: "/", disallow },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
