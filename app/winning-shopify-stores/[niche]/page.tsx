import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lock, TrendingUp } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";
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
 * page. Content is REAL Library data (names, thumbnails, conversion
 * metrics), so each page is substantive, unique and fresh — not doorway
 * spam. Niches under MIN_STORES 404 until the Library grows.
 *
 * Metrics gating mirrors the product: the top 3 stores show their real
 * conv_rate (same teaser the landing shows); the rest are locked behind
 * sign-in — the page IS the funnel into the Library.
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
    description: `A revenue-validated list of winning ${meta.plural} on Shopify: real stores, real conversion metrics, tracked live. Study what converts in ${meta.label.toLowerCase()} and audit your own store free.`,
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
      description: `Real ${meta.plural} actually converting, with live metrics from the EliteVault Library.`,
      type: "website",
      url: `${baseUrl}/winning-shopify-stores/${niche}`,
    },
  };
}

export default async function NichePage(props: {
  params: Promise<{ niche: string }>;
}) {
  const { niche } = await props.params;
  const page = await getNichePage(niche);
  if (!page) notFound();

  const others = (await getQualifyingNiches()).filter(
    (n) => n.slug !== page.slug,
  );
  const teaserCount = 3;

  const faqs = [
    {
      q: `What makes a winning ${page.label.toLowerCase()} Shopify store?`,
      a: `In ${page.label.toLowerCase()}, the stores that convert pair instant offer clarity with category-appropriate trust: strong above-the-fold imagery, visible social proof, and a checkout with no surprises. The ${page.stores.length} ${page.plural} in this list are validated by real revenue signals — not picked for looks${page.avgConv != null ? `, and they average a ${page.avgConv}% conversion rate` : ""}.`,
    },
    {
      q: `How do you verify these ${page.plural} are actually winning?`,
      a: "An AI agent watches paid-social cohorts and revenue signals and only surfaces stores generating sales right now. Each entry carries live metrics (conversion rate, CTR, traffic), so you study what's genuinely working — not a stale inspiration board.",
    },
    {
      q: `Can I compare my store against these ${page.plural}?`,
      a: "Yes — run a free EliteVault audit on your own URL. You get a conversion score, an annotated screenshot and ranked fixes, plus where you stand against your niche's average. No credit card, nothing to install.",
    },
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Winning ${page.label} Shopify Stores`,
      url: `${baseUrl}/winning-shopify-stores/${page.slug}`,
      description: `Revenue-validated winning ${page.plural} on Shopify with live conversion metrics.`,
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
          <DataPill items={["FROM THE LIBRARY", `${page.stores.length} ${page.label.toUpperCase()} WINNERS`]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            Winning {page.label} Shopify stores, validated by revenue.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            These {page.stores.length} {page.plural} are converting right now —
            surfaced by revenue signals, not picked for looks
            {page.avgConv != null && (
              <>
                {" "}
                (they average a{" "}
                <span className="text-white/85">{page.avgConv}% conversion rate</span>)
              </>
            )}
            . Study how they structure their hero, trust and offer — then run
            the same audit on your own store, free.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/analyzer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                Audit my store free
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              60 seconds · no card
            </span>
          </div>
        </div>

        {/* Store grid — top 3 show real conv_rate, rest locked (funnel) */}
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
                    alt={`${s.title} — winning ${page.label.toLowerCase()} Shopify store`}
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
              <div className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{s.title}</p>
                  <p className="font-mono text-xs text-white/40 truncate">
                    {s.domain}
                  </p>
                </div>
                {i < teaserCount && s.convRate != null ? (
                  <div className="shrink-0 rounded-lg bg-signal-600/10 px-2.5 py-1.5 text-right ring-1 ring-signal-500/20">
                    <p className="font-mono tabular-nums text-base leading-none text-signal-300">
                      {s.convRate}%
                    </p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-wider text-white/40">
                      conv. rate
                    </p>
                  </div>
                ) : (
                  <Link
                    href="/sign-in?next=/app/library"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/45 transition-colors hover:text-white/70"
                  >
                    <Lock className="size-3" />
                    Metrics
                  </Link>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* CTA into the Library */}
        <section className="mt-12 rounded-3xl border border-signal-500/20 bg-signal-600/[0.04] p-8 text-center">
          <TrendingUp className="mx-auto size-6 text-signal-300" />
          <h2 className="mt-3 font-serif text-2xl md:text-3xl tracking-tight text-white">
            Full metrics, image search, and every niche.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            The Library tracks all winners with conversion rate, CTR and
            traffic — filterable by niche, searchable by image similarity.
          </p>
          <Link href="/sign-in?next=/app/library">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg border border-signal-500/30 bg-signal-600/10 px-6 py-3 text-base font-medium text-signal-200 transition-colors hover:bg-signal-600/20">
              Log in to browse the full Library
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>

        {/* FAQ */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Winning {page.label.toLowerCase()} stores — FAQ
          </h2>
          <div className="mt-6 space-y-5">
            {faqs.map((f) => (
              <div key={f.q} className="border-t border-white/[0.06] pt-4">
                <h3 className="text-sm font-medium text-white">{f.q}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Cross-links: other niches + hub (crawl mesh) */}
        {others.length > 0 && (
          <section className="mt-16">
            <h2 className="font-serif text-xl tracking-tight text-white/85">
              Winners in other niches
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {others.map((n) => (
                <Link
                  key={n.slug}
                  href={`/winning-shopify-stores/${n.slug}`}
                  className="rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-1.5 text-sm text-white/60 transition-colors hover:border-white/[0.16] hover:text-white"
                >
                  {n.label} ({n.count})
                </Link>
              ))}
              <Link
                href="/winning-shopify-stores"
                className="rounded-full border border-signal-500/25 bg-signal-600/[0.05] px-4 py-1.5 text-sm text-signal-200 transition-colors hover:bg-signal-600/10"
              >
                All winning stores →
              </Link>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
