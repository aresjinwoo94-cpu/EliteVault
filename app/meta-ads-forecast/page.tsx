import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  Wallet,
  GitBranch,
  ShieldAlert,
  LineChart,
  Calculator,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";
import { getT } from "@/lib/i18n/server";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

export const metadata: Metadata = {
  title: "Meta Ads Forecast — Project a Campaign Before You Spend",
  description:
    "Forecast a 7-day Meta Ads campaign across 3 scenarios before you fund it. EliteVault projects spend, CPC, ROAS and revenue from your AOV and budget — an honest estimate, not a prediction.",
  keywords: [
    "meta ads forecast",
    "facebook ads forecast",
    "meta ads scenario modeler",
    "campaign forecast tool",
    "ad spend forecast",
    "meta ads roas calculator",
    "facebook ads projection",
    "ecommerce ad forecasting",
  ],
  alternates: { canonical: "/meta-ads-forecast" },
  openGraph: {
    title: "Meta Ads Forecast & Campaign Scenario Modeler — EliteVault",
    description:
      "Project a 7-day Meta campaign across conservative, balanced and aggressive scenarios before you spend a dollar.",
    type: "website",
    url: `${baseUrl}/meta-ads-forecast`,
  },
};

const SCENARIOS = [
  { icon: ShieldAlert, labelKey: "metaAdsPage.scenario1Label", bodyKey: "metaAdsPage.scenario1Body", tone: "text-warning" },
  { icon: LineChart, labelKey: "metaAdsPage.scenario2Label", bodyKey: "metaAdsPage.scenario2Body", tone: "text-signal-300" },
  { icon: TrendingUp, labelKey: "metaAdsPage.scenario3Label", bodyKey: "metaAdsPage.scenario3Body", tone: "text-success" },
];

const INPUTS = [
  { icon: Wallet, labelKey: "metaAdsPage.input1Label", bodyKey: "metaAdsPage.input1Body" },
  { icon: Calculator, labelKey: "metaAdsPage.input2Label", bodyKey: "metaAdsPage.input2Body" },
  { icon: GitBranch, labelKey: "metaAdsPage.input3Label", bodyKey: "metaAdsPage.input3Body" },
];

const FAQS = [
  {
    q: "What is a Meta Ads forecast?",
    a: "A Meta Ads forecast projects how a campaign is likely to perform — spend, clicks, CPC, ROAS and revenue — before you run it, based on your budget, average order value and current niche benchmarks. It turns 'let's just test and see' into a planned range.",
  },
  {
    q: "How accurate is the forecast?",
    a: "It's an honest estimate, not a prediction. The modeler uses real CPC/CPM/CTR/ROAS benchmarks and your store's numbers to project a realistic range — but actual results depend on your creative, offer and audience. Treat it as a planning tool, not a guarantee.",
  },
  {
    q: "Why model three scenarios instead of one?",
    a: "A single number hides risk. Conservative, balanced and aggressive cases show you the floor, the realistic middle and the upside together — so you fund a campaign knowing the downside, not just the dream.",
  },
  {
    q: "Do I need to connect my ad account?",
    a: "No. The forecast runs from a few inputs — budget, AOV and niche — so you can model a campaign before you've spent a dollar or even built it. Nothing to connect.",
  },
  {
    q: "Is the campaign modeler free?",
    a: "You can start free with a store audit. The 7-day Meta Ads Campaign Scenario Modeler is part of the Scale plan, alongside the Meta Ads optimizer targets and REST API.",
  },
];

export default async function MetaAdsForecastPage() {
  const { t } = await getT();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "EliteVault — Meta Ads Forecast & Campaign Scenario Modeler",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `${baseUrl}/meta-ads-forecast`,
      description:
        "Meta Ads forecast tool: project a 7-day campaign across conservative, balanced and aggressive scenarios from your AOV, budget and niche benchmarks.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Start free with a store audit; campaign modeler on the Scale plan.",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <MarketingNav />

      <main className="container max-w-5xl pt-28 pb-24 md:pt-36">
        {/* Hero */}
        <div className="max-w-3xl">
          <DataPill items={[t("metaAdsPage.badge1"), t("metaAdsPage.badge2")]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            {t("metaAdsPage.heroH1")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            {t("metaAdsPage.heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/analyzer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                {t("metaAdsPage.heroCta")}
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              {t("metaAdsPage.heroCaption")}
            </span>
          </div>
        </div>

        {/* Three scenarios */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            {t("metaAdsPage.scenariosH2")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
            {t("metaAdsPage.scenariosSub")}
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SCENARIOS.map((s) => (
              <div
                key={s.labelKey}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-2">
                  <s.icon className={`size-4 ${s.tone}`} />
                  <h3 className={`font-medium ${s.tone}`}>{t(s.labelKey)}</h3>
                </div>
                <p
                  className="mt-3 text-sm text-white/55 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: t(s.bodyKey) }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* What goes in */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            {t("metaAdsPage.inputsH2")}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INPUTS.map((c) => (
              <div
                key={c.labelKey}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                  <c.icon className="size-4 text-signal-300" />
                </div>
                <h3 className="mt-4 font-medium text-white">{t(c.labelKey)}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {t(c.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Honesty + fix-the-store-first */}
        <section className="mt-20 rounded-3xl border border-white/[0.06] bg-card p-6 shadow-card md:p-8">
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
              {t("metaAdsPage.honestyH2")}
            </h2>
            <p className="mt-3 text-sm text-white/55 leading-relaxed">
              {t("metaAdsPage.honestyBody1Pre")} <em>{t("metaAdsPage.honestyBody1Em")}</em> {t("metaAdsPage.honestyBody1Post")}
            </p>
            <p className="mt-3 text-sm text-white/55 leading-relaxed">
              {t("metaAdsPage.honestyBody2")}
            </p>
            <Link
              href="/blog/why-meta-ads-arent-converting"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-300 hover:text-signal-200"
            >
              {t("metaAdsPage.honestyLink")}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Meta Ads forecast — FAQ
          </h2>
          <div className="mt-6 space-y-5">
            {FAQS.map((f) => (
              <div key={f.q} className="border-t border-white/[0.06] pt-4">
                <h3 className="text-sm font-medium text-white">{f.q}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-16 rounded-3xl border border-champagne-400/20 bg-champagne-400/[0.04] p-8 text-center">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-white">
            {t("metaAdsPage.finalH2")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            {t("metaAdsPage.finalBody")}
          </p>
          <Link href="/sign-up?next=/app/analyzer">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
              {t("metaAdsPage.finalCta")}
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
