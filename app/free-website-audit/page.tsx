import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ScanLine,
  Eye,
  ListChecks,
  Gauge,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";
import { ScoreBadge } from "@/components/ui/score-badge";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

export const metadata: Metadata = {
  title: "Free Website Audit & Conversion Analyzer for Your Store",
  description:
    "Run a free website audit in 60 seconds. EliteVault's AI website analyzer scores your store, annotates what's costing you conversions, and ranks the fixes. No card.",
  keywords: [
    "free website audit",
    "website analyzer",
    "web analyzer",
    "free website analyzer",
    "website audit tool",
    "free store audit",
    "ecommerce website analyzer",
    "conversion audit",
  ],
  alternates: { canonical: "/free-website-audit" },
  openGraph: {
    title: "Free Website Audit & Conversion Analyzer — EliteVault",
    description:
      "A free AI website audit: score, annotated screenshot, and a ranked list of fixes in under a minute.",
    type: "website",
    url: `${baseUrl}/free-website-audit`,
  },
};

const CHECKS = [
  { icon: Eye, label: "First impression", body: "Is the offer clear in 2 seconds? The exact read a cold visitor gets." },
  { icon: Gauge, label: "Layout & hierarchy", body: "Above-the-fold, CTA placement, visual flow and proportion." },
  { icon: ShieldCheck, label: "Trust & proof", body: "Reviews, badges and guarantees — and whether they're where buyers look." },
  { icon: ScanLine, label: "Imagery & niche fit", body: "Whether your visuals match what converts in your category." },
  { icon: Zap, label: "CRO principles", body: "Friction, objection handling and the levers that move conversion." },
  { icon: ListChecks, label: "Technical signals", body: "Speed and on-page issues that quietly leak paid and organic traffic." },
];

const FAQS = [
  {
    q: "Is the website audit really free?",
    a: "Yes. Your first audit is free — you get the overall score and an annotated screenshot with no credit card. Paid plans unlock the prioritized fixes, buyer-persona simulation and unlimited audits.",
  },
  {
    q: "What is a website analyzer?",
    a: "A website analyzer reviews a page the way a visitor experiences it and reports what helps or hurts results. EliteVault is a conversion-focused analyzer: it scores your store, marks the specific problems on a screenshot, and ranks the fixes by impact.",
  },
  {
    q: "What does the free audit check?",
    a: "First impression and offer clarity, layout and hierarchy, trust and social proof, imagery and niche fit, CRO principles, and technical signals like speed — each scored and benchmarked against stores actually scaling.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Paste your URL and the analyzer captures and reviews your page automatically. Nothing to install, no code on your site.",
  },
  {
    q: "Does it work for any website?",
    a: "It's built for ecommerce and DTC stores (Shopify and beyond), where conversion is the goal. That focus is why the score and fixes are specific instead of generic.",
  },
];

export default function FreeWebsiteAuditPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "EliteVault — Free Website Audit & Conversion Analyzer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `${baseUrl}/free-website-audit`,
      description:
        "Free AI website audit and conversion analyzer for ecommerce stores: score, annotated screenshot and ranked fixes in under a minute.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "First website audit free — no credit card.",
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
          <DataPill items={["FREE WEBSITE AUDIT", "NO CREDIT CARD"]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            Free website audit — your store&apos;s conversion score in 60
            seconds
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            EliteVault is an AI website analyzer built for ecommerce. Paste your
            URL and get an honest conversion score, an annotated screenshot of
            exactly what&apos;s costing you sales, and a punch-list of fixes
            ranked by impact — free, no card, in under a minute.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/analyzer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                Audit my store free
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              1 free analysis · cancel anytime
            </span>
          </div>
        </div>

        {/* What it checks */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            What the website analyzer checks
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
            Six categories, scored the way a buyer — and a senior media buyer —
            actually experience your store.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CHECKS.map((c) => (
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

        {/* How it works */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            How the free audit works
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { n: 1, t: "Paste your URL", b: "No install, no code on your site. The analyzer captures your page automatically." },
              { n: 2, t: "AI reviews it cold", b: "A vision model reads your store like a first-time visitor and scores six categories." },
              { n: 3, t: "Get your score + fixes", b: "An annotated screenshot and a punch-list ranked by leverage — in under a minute." },
            ].map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <span className="num text-2xl text-gold-gradient">{s.n}</span>
                <h3 className="mt-2 font-medium text-white">{s.t}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {s.b}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* What you get */}
        <section className="mt-20 rounded-3xl border border-white/[0.06] bg-card p-6 shadow-card md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
                A real diagnosis, not a vanity number
              </h2>
              <p className="mt-3 text-sm text-white/55 leading-relaxed">
                Most &ldquo;free website audit&rdquo; tools spit out a generic
                score. EliteVault gives you an overall conversion score, the
                six category breakdowns, an annotated screenshot marking each
                issue, a buyer-persona reaction, and the fixes ranked by impact
                — the same diagnosis consultants charge $2,000 for.
              </p>
              <Link
                href="/blog/ecommerce-store-audit-vs-consultant"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-300 hover:text-signal-200"
              >
                Why the $2,000 audit is dead
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="num text-5xl text-gold-gradient leading-none">
                62
                <span className="ml-1 text-base text-white/40">/100</span>
              </span>
              <div className="flex flex-col gap-1.5">
                <ScoreBadge score={84} total={null} size="sm" />
                <ScoreBadge score={58} total={null} size="sm" />
                <ScoreBadge score={31} total={null} size="sm" />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Free website audit — FAQ
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
            Audit your store free
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            Your conversion score, an annotated screenshot, and a ranked
            punch-list — in under a minute. No credit card.
          </p>
          <Link href="/sign-up?next=/app/analyzer">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
              Run my free website audit
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
