import Link from "next/link";
import { MarketingNav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { LogoStrip } from "@/components/marketing/logo-strip";
import { FeaturesShowcase } from "@/components/marketing/features-showcase";
import { AnalyzerDemo } from "@/components/marketing/analyzer-demo";
import { Pricing } from "@/components/marketing/pricing";
import { FAQ } from "@/components/marketing/faq";
import { Footer } from "@/components/marketing/footer";

export default function HomePage() {
  return (
    <>
      <MarketingNav />
      <main className="relative">
        <Hero />
        <LogoStrip />
        <AnalyzerDemo />
        <FeaturesShowcase />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
