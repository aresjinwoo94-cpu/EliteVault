import { MarketingNav } from "@/components/marketing/nav";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";

export const metadata = { title: "Pricing" };

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
