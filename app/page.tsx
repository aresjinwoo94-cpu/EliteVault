import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketingNav } from "@/components/marketing/nav";

/**
 * Homepage metadata — keyword-led title/description so the strongest page
 * targets the queries we want to rank for ("free website audit", "website
 * analyzer"). The visible hero copy is unchanged; only the SERP title is.
 */
export const metadata: Metadata = {
  title: {
    // Brief §4.2 — keep the light keywords in <title>, lead with the hook.
    absolute:
      "Free Shopify Store Audit — Fix Why Visitors Don't Buy Before You Run Meta Ads | EliteVault",
  },
  description:
    "Before you lose thousands on Meta ads, test your store first. Free 60-second AI audit like a senior media buyer: score, annotated screenshot and the #1 fix costing you conversions. No login.",
  keywords: [
    // Core bottom-funnel keywords that already rank — kept intact.
    "free website audit",
    "free shopify store audit",
    "ai store audit",
    "ecommerce conversion analyzer",
    "shopify store audit",
    "cro audit tool",
    "winning shopify stores",
    "buyer persona simulator",
    "meta ads forecast",
    "dtc conversion optimization",
    "website analyzer",
    // Design/desire cluster (buyer-persona SEO layer) — added, not replacing.
    "shopify store design audit",
    "does my store look trustworthy",
    "ecommerce website design review",
    "why visitors don't buy",
    "store design conversion audit",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    // Brief §4.2 — hook-forward og/twitter title + description.
    title: "Before you lose thousands on Meta ads, try this — EliteVault",
    description:
      "Test your store like a senior media buyer before you spend on Meta: a free 60-second AI audit with your score, an annotated screenshot and the #1 fix costing you conversions.",
    type: "website",
    url: "/",
  },
  twitter: {
    title: "Before you lose thousands on Meta ads, try this — EliteVault",
    description:
      "Test your store like a senior media buyer before you spend on Meta: a free 60-second AI audit with your score, an annotated screenshot and the #1 fix costing you conversions.",
  },
};

/**
 * Force dynamic rendering — Vercel was edge-caching the landing HTML for
 * ~1 hour and serving the SAME pre-rendered "anonymous visitor" version
 * to EVERY request, including authenticated users. That defeated the
 * auth-check below (it ran once at build time / first request, cached
 * the result, never re-checked). Marking the route dynamic disables
 * the cache so the server-side auth check runs on every visit.
 */
export const dynamic = "force-dynamic";

import { Hero } from "@/components/marketing/hero";
import { SocialStrip } from "@/components/marketing/social-strip";
import { WhoFor } from "@/components/marketing/who-for";
import { ScanDivider } from "@/components/marketing/scan-field";
import { FeaturesShowcase } from "@/components/marketing/features-showcase";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { AnalyzerDemo } from "@/components/marketing/analyzer-demo";
import { TwoPaths } from "@/components/marketing/two-paths";
import { SocialProof } from "@/components/marketing/social-proof";
import { Reviews } from "@/components/marketing/reviews";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { PLANS } from "@/lib/stripe/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing-page JSON-LD structured data.
 *
 * Two schemas worth advertising to Google here:
 *   1. SoftwareApplication — tells search results this is a real product
 *      with offers + pricing. Powers rich-result eligibility (price chip,
 *      review snippets if we ever add them).
 *   2. FAQPage (built dynamically below) — if Google picks it up, our
 *      FAQ questions can render as expandable accordions DIRECTLY in
 *      the search result page. Huge CTR boost when it works.
 *
 * We compute the SoftwareApplication offers from PLANS so changes to
 * pricing stay in sync without manual edits here.
 */
function buildLandingJsonLd() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "EliteVault",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Ecommerce Conversion Optimization",
    operatingSystem: "Web",
    url: baseUrl,
    description:
      "AI-powered ecommerce audit with annotated screenshots, buyer-persona simulations, and a 7-day Meta Ads campaign scenario modeler.",
    offers: Object.values(PLANS).map((plan) => ({
      "@type": "Offer",
      name: `EliteVault ${plan.name}`,
      price: plan.price.month,
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: plan.price.month,
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitText: "month",
      },
      description: plan.description,
      url: `${baseUrl}/pricing`,
    })),
  };

  // Pull FAQ items in-process from a small static list (faster than
  // duplicating the FAQ component's data; if we ever externalize the
  // FAQ data we'll import from there).
  const faqItems: { question: string; answer: string }[] = [
    {
      question: "What does the EliteVault analyzer do?",
      answer:
        "Paste a URL and EliteVault returns a CRO audit: annotated screenshot, six category scores (color, layout, imagery, technical, niche fit, CRO principles), a buyer-persona simulation, conversion-rate scenarios, and a ranked punch-list of fixes.",
    },
    {
      question: "How accurate is the 7-day campaign scenario modeler?",
      answer:
        "It's an honest estimate, not a prediction. The modeler uses real 2024-25 niche benchmarks, applies hard ROAS ceilings based on the audit score, factors in country CPM multipliers, iOS attribution loss, and seasonality. For stores with audit scores under 55, it will project losses — because that's what cold campaigns usually do in week 1.",
    },
    {
      question: "Do I need a Meta Ads account to use EliteVault?",
      answer:
        "No. The analyzer works on any URL. The 7-day scenario modeler is included on Pro (1 projection/month) and unlimited on Scale; the Meta Ads optimizer targets are a Scale add-on — you don't need an active Meta account for either.",
    },
    {
      question: "Is there a free plan?",
      // Prices derive from PLANS (single source of truth) — never hardcode.
      answer: `Yes. The Free plan runs one full audit of your store — score, annotated screenshot, your #1 priority fix unlocked and a modeled 7-day ROAS range — plus 3 hand-picked winning stores with full metrics. Pro ($${PLANS.pro.price.month}/mo) unlocks the rest of your ranked fixes, the buyer-persona simulation, unlimited audits and 1 Meta campaign projection/month. Scale ($${PLANS.scale.price.month}/mo) adds unlimited projections and the REST API.`,
    },
  ];

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "EliteVault",
    url: baseUrl,
    description:
      "AI conversion audits for ecommerce — a CRO score, annotated screenshot, and ranked fixes in under a minute.",
  };

  return [softwareApplication, faqPage, website];
}

export default async function HomePage() {
  // v3.6.2 — if the visitor is already signed in, skip the marketing
  // landing and drop them straight into the app. They explicitly chose
  // this product; making them re-scroll past the pitch every visit is
  // friction. Logged-out visitors still see the full landing.
  // (Default in-app destination is the Analyzer — same default as the
  // post-login redirect; explicit `next` links still reach other pages.)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/app/analyzer");
  }

  const jsonLd = buildLandingJsonLd();
  return (
    <>
      {/*
        Page-level structured data. SoftwareApplication helps Google
        understand pricing tiers; FAQPage can become inline accordions
        in the SERP. The Organization schema lives in app/layout.tsx
        and applies to every route.
      */}
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <MarketingNav />
      <main className="relative">
        <Hero />
        <SocialStrip />
        <WhoFor />
        <AnalyzerDemo />
        <ScanDivider />
        <TwoPaths />
        <FeaturesShowcase />
        {/* Verified proof paid EARLY: with the verified-stats layer, reviews are
            hard evidence (real money + audit count + verified check), not vibes.
            The skeptical reader sees that proof BEFORE the "us vs competitors"
            table and the founder's close. Flow: product (AnalyzerDemo, Features)
            → real proof (Reviews) → differentiation (Comparison) → founder
            credibility (SocialProof) → pricing.
            ALT (1-line swap if Ariel prefers the proof cluster kept together
            just before price): ComparisonTable → Reviews → SocialProof → Pricing. */}
        <Reviews />
        <ComparisonTable />
        <SocialProof />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
