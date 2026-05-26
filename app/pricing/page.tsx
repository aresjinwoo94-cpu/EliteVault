import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";

// Per-route metadata. Title slots into the layout's template ("%s · EliteVault")
// so the browser tab and search-result title both read "Pricing · EliteVault".
// Description is unique so Google doesn't penalize duplicate descriptions
// across routes.
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for EliteVault. Free tier with 9 hand-picked winning stores. Pro at $19/mo for the full analyzer. Scale at $49/mo for Meta Ads optimization + 7-day scenario modeler + REST API.",
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
  return (
    <>
      <MarketingNav />
      <main className="pt-32 pb-8">
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
