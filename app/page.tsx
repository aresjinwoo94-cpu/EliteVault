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
    absolute: "Free Website Audit & Store Analyzer — EliteVault",
  },
  description:
    "EliteVault is a free AI website audit and conversion analyzer for ecommerce. Score your store, see exactly what's costing you sales, and get ranked fixes — in 60 seconds, no card.",
  keywords: [
    "free website audit",
    "ai store audit",
    "ecommerce conversion analyzer",
    "shopify store audit",
    "cro audit tool",
    "winning shopify stores",
    "buyer persona simulator",
    "meta ads forecast",
    "dtc conversion optimization",
    "website analyzer",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Free Website Audit & Store Analyzer — EliteVault",
    description:
      "Free AI conversion audit for ecommerce: score, annotated screenshot and ranked fixes in 60 seconds. Plus a library of winning stores and a 7-day Meta Ads modeler.",
    type: "website",
    url: "/",
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
import { LogoStrip } from "@/components/marketing/logo-strip";
import { FeaturesShowcase } from "@/components/marketing/features-showcase";
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
        "No. The analyzer works on any URL. The Meta Ads optimizer and scenario modeler are Scale-plan add-ons that recommend targets and project campaigns — you don't need an active Meta account.",
    },
    {
      question: "Is there a free plan?",
      // Prices derive from PLANS (single source of truth) — never hardcode.
      answer: `Yes. The Free plan gives you the curated library of 9 hand-picked winning stores with full metrics. The Analyzer requires Pro ($${PLANS.pro.price.month}/mo). The scenario modeler and REST API require Scale ($${PLANS.scale.price.month}/mo).`,
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
  // landing and drop them straight into the analyzer. They explicitly
  // chose this product; making them re-scroll past the pitch every visit
  // is friction. Logged-out visitors still see the full landing.
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
        <LogoStrip />
        <AnalyzerDemo />
        <TwoPaths />
        <FeaturesShowcase />
        <SocialProof />
        <Reviews />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
