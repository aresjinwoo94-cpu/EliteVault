import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, TrendingUp } from "lucide-react";
import { AnonAuditBox } from "@/components/marketing/anon-audit-box";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";
import { getT } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/lookup";
import {
  getNichePage,
  getQualifyingNiches,
  NICHE_LABELS,
} from "@/lib/library/niche-pages";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

/**
 * Programmatic SEO page: /winning-shopify-stores/[niche]
 *
 * Long-tail capture ("winning skincare shopify stores", "best beverage
 * shopify stores"…) where the generic listicles don't field a dedicated
 * page. Content is REAL Library data (names, thumbnails, niche, a Shopify
 * badge when verified, a Meta ad count when really measured), so each page is substantive, unique and fresh — not doorway
 * spam. Niches under MIN_STORES 404 until the Library grows.
 *
 * No metrics here: only verifiable facts (see components/library/site-card.tsx). The page is the funnel
 * into the Library.
 *
 * English on purpose (SEO surface), like the hub page's FAQ.
 */

export const revalidate = 3600;

export async function generateMetadata(props: {
  params: Promise<{ niche: string }>;
}): Promise<Metadata> {
  const { niche } = await props.params;
  const meta = NICHE_LABELS[niche];
  if (!meta) return {};
  return {
    title: {
      absolute: `Winning ${meta.label} Shopify Stores (2026) — Real Examples | EliteVault`,
    },
    description: `A curated list of winning ${meta.plural} on Shopify: real stores, checked automatically. Study what converts in ${meta.label.toLowerCase()} and audit your own store free.`,
    keywords: [
      `winning ${meta.label.toLowerCase()} shopify stores`,
      `best ${meta.label.toLowerCase()} shopify stores`,
      `${meta.label.toLowerCase()} shopify store examples`,
      `top ${meta.plural}`,
      `${meta.label.toLowerCase()} dtc brands`,
    ],
    alternates: { canonical: `/winning-shopify-stores/${niche}` },
    openGraph: {
      title: `Winning ${meta.label} Shopify Stores — EliteVault`,
      description: `Real ${meta.plural} from the EliteVault Library.`,
      type: "website",
      url: `${baseUrl}/winning-shopify-stores/${niche}`,
    },
  };
}

export default async function NichePage(props: {
  params: Promise<{ niche: string }>;
}) {
  const { niche } = await props.params;
  const { t } = await getT();
  const page = await getNichePage(niche);
  if (!page) notFound();

  const others = (await getQualifyingNiches()).filter(
    (n) => n.slug !== page.slug,
  );

  const faqs = [
    {
      q: `What makes a winning ${page.label.toLowerCase()} Shopify store?`,
      a: `In ${page.label.toLowerCase()}, the stores that convert pair instant offer clarity with category-appropriate trust: strong above-the-fold imagery, visible social proof, and a checkout with no surprises. The ${page.stores.length} ${page.plural} in this list were chosen by an AI assistant and passed automated checks — not picked for looks.`,
    },
    {
      q: `How do you verify these ${page.plural} are actually winning?`,
      a: "We don't claim to audit their books. Candidate stores are proposed by an AI assistant and published only after automated checks (site live, complete listing, niche fit). When we show an ad count it is a real Meta Ad Library measurement; we show no conversion or traffic figures we can't verify.",
    },
    {
      q: `Can I compare my store against these ${page.plural}?`,
      a: "Yes — run an EliteVault audit on your own URL. You get an annotated screenshot and ranked fixes, plus which store in your niche is ahead of you and what it does differently. No credit card, nothing to install.",
    },
  ];

  // Placeholders for the visible (translated) FAQ; the JSON-LD above stays English.
  const faqVars = {
    label: page.label.toLowerCase(),
    plural: page.plural,
    n: page.stores.length,
  };

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Winning ${page.label} Shopify Stores`,
      url: `${baseUrl}/winning-shopify-stores/${page.slug}`,
      description: `Curated winning ${page.plural} on Shopify, checked automatically.`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "EliteVault", item: baseUrl },
        {
          "@type": "ListItem",
          position: 2,
          name: "Winning Shopify Stores",
          item: `${baseUrl}/winning-shopify-stores`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: page.label,
          item: `${baseUrl}/winning-shopify-stores/${page.slug}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
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
        {/* Hero — direct answer first */}
        <div className="max-w-3xl">
          <DataPill
            items={[
              t("nichePage.fromLibrary"),
              fill(t("nichePage.winnersPill"), {
                n: page.stores.length,
                label: page.label.toUpperCase(),
              }),
            ]}
          />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            {fill(t("nichePage.h1"), { label: page.label })}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            {fill(t("nichePage.intro"), { n: page.stores.length, plural: page.plural })}
            {t("nichePage.introEnd")}
          </p>
          {/*
            The copy above ends on "run the same audit on your own store,
            free" — so this runs it, rather than sending the visitor to a
            signup form.
          */}
          <AnonAuditBox
            className="mt-8"
            source="winning-shopify-stores-niche-hero"
            ctaLabel={t("nichePage.cta")}
            caption={t("nichePage.caption")}
            captionClassName="font-mono uppercase tracking-wider text-white/40"
            secondary={{
              href: "/sign-up?next=/app/analyzer",
              label: t("hero.signUpFallback"),
            }}
          />
        </div>

        {/* Store grid — name, niche, Shopify badge (verified only) and a Meta ad count (real measurements only). No estimates. */}
        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.stores.map((s, i) => (
            <div
              key={s.domain}
              className="overflow-hidden rounded-2xl border border-white/[0.06] bg-card shadow-card"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-obsidian-800">
                {s.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.thumbnailUrl}
                    alt={fill(t("nichePage.thumbAlt"), {
                      title: s.title,
                      label: page.label.toLowerCase(),
                    })}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center font-serif text-4xl text-white/20">
                    {s.title.charAt(0)}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-obsidian-950/80 to-transparent" />
              </div>
              <div className="p-4">
                <p className="font-medium text-white truncate">{s.title}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-white/45">{page.label}</span>
                  {s.shopifyVerified && (
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55">
                      Shopify
                    </span>
                  )}
                </div>
                {s.measuredAds !== null && (
                  <p className="mt-2 text-[11px] text-white/55">
                    {fill(t("siteCard.metaAds"), { n: s.measuredAds })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* CTA into the Library */}
        <section className="mt-12 rounded-3xl border border-signal-500/20 bg-signal-600/[0.04] p-8 text-center">
          <TrendingUp className="mx-auto size-6 text-signal-300" />
          <h2 className="mt-3 font-serif text-2xl md:text-3xl tracking-tight text-white">
            {t("nichePage.fullMetrics")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            {t("nichePage.libraryBody")}
          </p>
          <Link href="/sign-in?next=/app/library">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg border border-signal-500/30 bg-signal-600/10 px-6 py-3 text-base font-medium text-signal-200 transition-colors hover:bg-signal-600/20">
              {t("nichePage.login")}
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>

        {/* FAQ */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            {fill(t("nichePage.faqTitle"), { label: page.label.toLowerCase() })}
          </h2>
          <div className="mt-6 space-y-5">
            {faqs.map((f, i) => (
              <div key={f.q} className="border-t border-white/[0.06] pt-4">
                <h3 className="text-sm font-medium text-white">
                  {fill(t(`nichePage.faqQ${i}`), faqVars)}
                </h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {fill(t(`nichePage.faqA${i}`), faqVars)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-links: other niches + hub (crawl mesh) */}
        {others.length > 0 && (
          <section className="mt-16">
            <h2 className="font-serif text-xl tracking-tight text-white/85">
              {t("nichePage.others")}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {others.map((n) => (
                <Link
                  key={n.slug}
                  href={`/winning-shopify-stores/${n.slug}`}
                  className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 min-h-11 text-sm text-white/60 transition-colors hover:border-white/[0.16] hover:text-white"
                >
                  {n.label} ({n.count})
                </Link>
              ))}
              <Link
                href="/winning-shopify-stores"
                className="inline-flex items-center rounded-full border border-signal-500/25 bg-signal-600/[0.05] px-4 py-2 min-h-11 text-sm text-signal-200 transition-colors hover:bg-signal-600/10"
              >
                {t("nichePage.allWinners")}
              </Link>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
