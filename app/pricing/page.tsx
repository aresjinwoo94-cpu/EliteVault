import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";
import { PLANS } from "@/lib/stripe/plans";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

// End date of the launch-price promo, mirrored in the visual anchor on the
// pricing cards (lib/stripe/plans.ts launchAnchor). TODO(owner): confirm or
// move this date — after it, either raise prices to the anchor or extend it.
const LAUNCH_PRICE_VALID_UNTIL = "2026-09-30";

// Per-route metadata. Title slots into the layout's template ("%s · EliteVault")
// so the browser tab and search-result title both read "Pricing · EliteVault".
// Description is unique so Google doesn't penalize duplicate descriptions
// across routes.
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for EliteVault. Free tier with 9 hand-picked winning stores. Pro at $19/mo for the full analyzer. Scale at $49/mo for Meta Ads optimization + 7-day scenario modeler + REST API.",
  keywords: [
    "elitevault pricing",
    "ecommerce audit pricing",
    "cro tool pricing",
    "shopify audit plans",
    "meta ads tool pricing",
    "free store audit",
    "conversion optimization software cost",
  ],
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing — EliteVault",
    description:
      "Free / Pro $19 / Scale $49. AI audit, library of winning stores, Meta Ads scenario modeler.",
    type: "website",
  },
};

export default function PricingPage() {
  // Product + Offer structured data — makes the tiers eligible for price
  // rich results. Prices come from PLANS (single source of truth); no
  // aggregateRating (no verifiable third-party reviews yet — faking one
  // violates Google's policies).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "EliteVault",
    description:
      "AI conversion audits for ecommerce — CRO score, annotated screenshot, buyer-persona simulation and a 7-day Meta Ads scenario modeler.",
    brand: { "@type": "Brand", name: "EliteVault" },
    url: `${baseUrl}/pricing`,
    offers: Object.values(PLANS).map((plan) => ({
      "@type": "Offer",
      name: `EliteVault ${plan.name} (monthly)`,
      price: plan.price.month,
      priceCurrency: "USD",
      url: `${baseUrl}/pricing`,
      availability: "https://schema.org/InStock",
      ...(plan.launchAnchor
        ? { priceValidUntil: LAUNCH_PRICE_VALID_UNTIL }
        : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav />
      <main className="pt-32 pb-8">
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
