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
    absolute: "Free Shopify & Ecommerce Store Audit (AI) — EliteVault",
  },
  description:
    "Free AI store audit for Shopify & DTC: get a CRO score, an annotated screenshot and ranked fixes in 60 seconds — no card. See why top stores convert and copy it.",
  keywords: [
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
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { AnalyzerDemo } from "@/components/marketing/analyzer-demo";
import { TwoPaths } from "@/components/marketing/two-paths";
import { SocialProof } from "@/components/marketing/social-proof";
import { Reviews } from "@/components/marketing/reviews";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { PLANS } from "@/lib/stripe/plans";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { FeaturedStore } from "@/components/marketing/social-proof";

/**
 * Fetch 3 real winning stores from the Library for the social-proof
 * section — replaces the old "illustrative" cards with entries a
 * logged-in user actually sees. Only stores with self-hosted thumbnails
 * qualify (mshots URLs can render blank), ranked featured-first then by
 * real conv_rate. Fails soft: on any error the section renders without
 * cards rather than breaking the landing.
 */
async function getFeaturedStores(): Promise<FeaturedStore[]> {
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from("winning_sites")
      .select("title, niche, thumbnail_url, metrics, is_featured")
      .like("thumbnail_url", "%/storage/v1/object/public/%")
      .limit(24);
    if (!Array.isArray(data)) return [];
    return (
      (data as unknown as {
        title: string;
        niche: string;
        thumbnail_url: string;
        metrics: { conv_rate?: number } | null;
        is_featured: boolean;
      }[])
        .map((row) => ({
          title: row.title,
          niche: row.niche,
          // Supabase image transform: ~85% lighter than the raw capture.
          thumbnailUrl: `${row.thumbnail_url.replace(
            "/storage/v1/object/public/",
            "/storage/v1/render/image/public/",
          )}?width=800&quality=70`,
          convRate:
            typeof row.metrics?.conv_rate === "number"
              ? row.metrics.conv_rate
              : null,
          featured: row.is_featured,
        }))
        .sort(
          (a, b) =>
            Number(b.featured) - Number(a.featured) ||
            (b.convRate ?? 0) - (a.convRate ?? 0),
        )
        .slice(0, 3)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ featured, ...store }) => store)
    );
  } catch (err) {
    console.warn("[landing] featured stores fetch failed:", (err as Error).message);
    return [];
  }
}

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
  const featuredStores = await getFeaturedStores();
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
        <ComparisonTable />
        <Reviews />
        <SocialProof stores={featuredStores} />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
