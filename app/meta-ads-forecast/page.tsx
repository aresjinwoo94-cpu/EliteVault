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
  {
    icon: ShieldAlert,
    label: "Conservative",
    body: "The cautious case — softer CTR and ROAS. The floor you should be able to live with if the creative underperforms.",
    tone: "text-warning",
  },
  {
    icon: LineChart,
    label: "Balanced",
    body: "The realistic mid-case built from current niche benchmarks for your AOV and budget. Your planning number.",
    tone: "text-signal-300",
  },
  {
    icon: TrendingUp,
    label: "Aggressive",
    body: "The upside if the angle hits — stronger CTR and efficiency. What &ldquo;working&rdquo; could look like.",
    tone: "text-success",
  },
];

const INPUTS = [
  {
    icon: Wallet,
    label: "Your budget & AOV",
    body: "Daily spend and average order value anchor the math to your store, not a generic template.",
  },
  {
    icon: Calculator,
    label: "Real niche benchmarks",
    body: "CPC, CPM, CTR and ROAS ranges drawn from current ecommerce benchmarks for your category.",
  },
  {
    icon: GitBranch,
    label: "Three parallel scenarios",
    body: "Conservative, balanced and aggressive — modeled together so you see the full range before funding.",
  },
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

export default function MetaAdsForecastPage() {
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
          <DataPill items={["META ADS FORECAST", "BEFORE YOU SPEND A DOLLAR"]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            Forecast your Meta Ads campaign before you fund it
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            EliteVault projects a 7-day Meta campaign across three scenarios —
            conservative, balanced and aggressive — using your budget, average
            order value and current niche benchmarks. See the likely spend, CPC,
            ROAS and revenue range before you commit, so you know whether the
            math even works.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/analyzer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                Model my campaign
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              estimate, not prediction
            </span>
          </div>
        </div>

        {/* Three scenarios */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Three scenarios, modeled side by side
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
            One projection hides the risk. The modeler shows the floor, the
            realistic middle and the upside together.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {SCENARIOS.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-2">
                  <s.icon className={`size-4 ${s.tone}`} />
                  <h3 className={`font-medium ${s.tone}`}>{s.label}</h3>
                </div>
                <p
                  className="mt-3 text-sm text-white/55 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: s.body }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* What goes in */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            What the forecast is built from
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INPUTS.map((c) => (
              <div
                key={c.label}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                  <c.icon className="size-4 text-signal-300" />
                </div>
                <h3 className="mt-4 font-medium text-white">{c.label}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Honesty + fix-the-store-first */}
        <section className="mt-20 rounded-3xl border border-white/[0.06] bg-card p-6 shadow-card md:p-8">
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
              A planning tool, not a crystal ball
            </h2>
            <p className="mt-3 text-sm text-white/55 leading-relaxed">
              We keep this honest: the forecast is an <em>estimate</em> based on
              real benchmarks and your numbers — not a prediction of what will
              happen. The biggest variable isn&apos;t the model, it&apos;s your
              store. A great forecast on a page that doesn&apos;t convert cold
              traffic is just an expensive lesson waiting to happen.
            </p>
            <p className="mt-3 text-sm text-white/55 leading-relaxed">
              So forecast the campaign — then make sure the destination can take
              the traffic.
            </p>
            <Link
              href="/blog/why-meta-ads-arent-converting"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-300 hover:text-signal-200"
            >
              Why your Meta ads aren&apos;t converting
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
            Know the math before you spend
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            Start free with a store audit. The 7-day Meta Ads Campaign Scenario
            Modeler lives on the Scale plan.
          </p>
          <Link href="/sign-up?next=/app/analyzer">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
              Start free
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
