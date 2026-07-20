import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  Filter,
  ImageIcon,
  Radar,
  BarChart3,
  Layers,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";
import { getT } from "@/lib/i18n/server";
import { getQualifyingNiches } from "@/lib/library/niche-pages";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

export const metadata: Metadata = {
  title: "Winning Shopify Stores 2026 — Live Library | EliteVault",
  description:
    "Browse a live library of winning Shopify & DTC stores validated by real revenue signals. Filter by niche, search by image similarity, and copy what actually converts.",
  keywords: [
    "winning shopify stores",
    "winning ecommerce stores",
    "winning store database",
    "find winning shopify stores",
    "best dtc stores",
    "shopify store inspiration",
    "winning store library",
    "ecommerce design examples",
  ],
  alternates: { canonical: "/winning-shopify-stores" },
  openGraph: {
    title: "Winning Shopify Stores — Live Library — EliteVault",
    description:
      "A revenue-validated library of winning ecommerce stores, filterable by niche, with image-similarity search.",
    type: "website",
    url: `${baseUrl}/winning-shopify-stores`,
  },
};

const CARDS = [
  {
    icon: TrendingUp,
    labelKey: "winnersPage.card1Label",
    bodyKey: "winnersPage.card1Body",
  },
  {
    icon: Filter,
    labelKey: "winnersPage.card2Label",
    bodyKey: "winnersPage.card2Body",
  },
  {
    icon: ImageIcon,
    labelKey: "winnersPage.card3Label",
    bodyKey: "winnersPage.card3Body",
  },
];

const STEPS = [
  {
    icon: Radar,
    titleKey: "winnersPage.step1Title",
    bodyKey: "winnersPage.step1Body",
  },
  {
    icon: BarChart3,
    titleKey: "winnersPage.step2Title",
    bodyKey: "winnersPage.step2Body",
  },
  {
    icon: Layers,
    titleKey: "winnersPage.step3Title",
    bodyKey: "winnersPage.step3Body",
  },
];

// English FAQ — tied to the FAQPage JSON-LD below, kept in English for SEO.
const FAQS = [
  {
    q: "How do you find winning Shopify stores?",
    a: "An AI agent watches paid-social cohorts and revenue signals and surfaces stores actually generating sales right now — not a stale 'top stores' list. Each entry comes with metrics so you study winners that are genuinely working, filtered by niche.",
  },
  {
    q: "Is the winning-stores library free?",
    a: "The Free plan includes 9 hand-picked winning stores with full metrics and the community feed. Pro and Scale unlock the full library, unlimited entries and image-similarity search.",
  },
  {
    q: "How is this different from a Shopify spy tool?",
    a: "Spy tools dump products and ad creatives. EliteVault is built for conversion: it pairs revenue-validated winners with image-similarity search (find the stores structurally closest to yours) and a free audit of your own store, so you copy the principles that actually convert.",
  },
  {
    q: "Can I find winners in my specific niche?",
    a: "Yes. Filter the library by niche so you study the stores most relevant to your category — what converts in skincare is different from supplements, and the library respects that.",
  },
];

export default async function WinningShopifyStoresPage() {
  const { t } = await getT();
  const niches = await getQualifyingNiches();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "EliteVault — Winning Shopify Stores Library",
      url: `${baseUrl}/winning-shopify-stores`,
      description:
        "A live, revenue-validated library of winning Shopify and ecommerce stores, filterable by niche, with image-similarity search.",
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
          <DataPill items={[t("winnersPage.badge1"), t("winnersPage.badge2")]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            {t("winnersPage.heroH1")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            {t("winnersPage.heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/library">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                {t("winnersPage.heroCta")}
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              {t("winnersPage.heroCaption")}
            </span>
          </div>
        </div>

        {/* What's inside */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            {t("winnersPage.whatH2")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
            {t("winnersPage.whatSub")}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((c) => (
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

        {/* How it works */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            {t("winnersPage.howH2")}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.titleKey}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span className="num text-2xl text-gold-gradient">{i + 1}</span>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                    <s.icon className="size-4 text-signal-300" />
                  </div>
                </div>
                <h3 className="mt-4 font-medium text-white">{t(s.titleKey)}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {t(s.bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Value / reverse-engineer link */}
        <section className="mt-20 rounded-3xl border border-white/[0.06] bg-card p-6 shadow-card md:p-8">
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
              {t("winnersPage.valueH2")}
            </h2>
            <p className="mt-3 text-sm text-white/55 leading-relaxed">
              {t("winnersPage.valueBody")}
            </p>
            <Link
              href="/blog/reverse-engineer-winning-shopify-stores"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-300 hover:text-signal-200"
            >
              {t("winnersPage.valueLink")}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </section>

        {/* Browse by niche — links into the programmatic niche pages
            (SEO crawl mesh + genuinely useful navigation) */}
        {niches.length > 0 && (
          <section className="mt-20">
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
              Browse winners by niche
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
              What converts in skincare kills conversion in supplements — study
              the winners of your own category.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {niches.map((n) => (
                <Link
                  key={n.slug}
                  href={`/winning-shopify-stores/${n.slug}`}
                  className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-1.5 text-sm text-white/60 transition-colors hover:border-white/[0.16] hover:text-white"
                >
                  {n.label} ({n.count})
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* FAQ (English, tied to JSON-LD) */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Winning Shopify stores — FAQ
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
            {t("winnersPage.finalH2")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            {t("winnersPage.finalBody")}
          </p>
          <Link href="/sign-up?next=/app/library">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
              {t("winnersPage.finalCta")}
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
