import { PLANS } from "@/lib/stripe/plans";
import { COMPANY } from "@/lib/company";

export const dynamic = "force-static";
export const revalidate = 86400; // 1 day

/**
 * /llms.txt — the emerging convention for describing a site to LLM / answer
 * engines (ChatGPT, Gemini, Perplexity, Claude). A concise, structured,
 * factual summary so AI tools can understand and cite EliteVault accurately.
 * Facts derive from PLANS + COMPANY so they never drift. No marketing fluff,
 * no unverifiable claims.
 */
export function GET() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

  const body = `# EliteVault

> AI conversion-audit tool for ecommerce founders. Paste a store URL and get a CRO score, an annotated screenshot, a buyer-persona simulation, and a ranked list of fixes in under a minute.

EliteVault is operated by ${COMPANY.legalEntity} (${COMPANY.country}). Scores, persona simulations and Meta Ads projections are AI-generated estimates to guide decisions — not guarantees of any outcome.

## What it does
- Website Analyzer: CRO audit with an overall score (0-100), an annotated homepage screenshot, six category scores (color, layout, imagery, technical, niche fit, CRO principles), and a ranked punch-list of fixes.
- Buyer-persona simulation of how a target shopper reacts to the store.
- Meta Ads 7-day, 3-scenario campaign modeler (Scale plan).
- Library of vetted high-performing ecommerce stores with metrics.
- Weekly niche Trends and continuous competitor monitoring with email digests.
- REST API with bearer tokens (Scale plan).

## Pricing
- Free: one audit of your own store + the winning-store library. No card required.
- Pro: $${PLANS.pro.price.month}/mo (or $${PLANS.pro.price.year}/yr) — full Analyzer, unlimited audits, buyer-persona simulations.
- Scale: $${PLANS.scale.price.month}/mo (or $${PLANS.scale.price.year}/yr) — Meta Ads scenario modeler + REST API.

## Key pages
- [Home](${base}/): what EliteVault does.
- [Pricing](${base}/pricing): plans and prices.
- [About](${base}/about): company and founder.
- [Help center](${base}/support): onboarding, billing, privacy, support.
- [API docs](${base}/docs/api): REST API reference.
- [Privacy Policy](${base}/legal/privacy)
- [Terms of Service](${base}/legal/terms)

## Data & privacy
EliteVault processes the URLs and screenshots you submit with Google Gemini to generate audits. It does NOT train AI models on customer content and does not sell or share screenshots.

## Contact
${COMPANY.contactEmail}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
