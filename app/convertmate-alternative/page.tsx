import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Scan,
  Library,
  Brain,
  ShieldCheck,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

/**
 * /convertmate-alternative — competitor-capture SEO page.
 *
 * ConvertMate (AI CRO / product-page optimization for Shopify) announced
 * it is shutting down; searches for "convertmate alternative" are orphan
 * demand. This page answers that intent directly in the first paragraphs
 * (GEO: LLMs extract from the top), maps the old workflow to EliteVault
 * features, and carries FAQPage + BreadcrumbList JSON-LD.
 *
 * LEGAL: descriptions of ConvertMate are factual and neutral — no
 * disparagement, no unverifiable feature claims. The migration table maps
 * *use cases* to EliteVault features instead of asserting a cell-by-cell
 * feature comparison of a product we can't verify anymore.
 *
 * Written in English on purpose (SEO capture page), same pattern as the
 * hardcoded-English FAQ blocks on the other landing pages.
 *
 * This page is the TEMPLATE for future "[competitor] alternative" pages —
 * copy the structure, swap the name, intent paragraph and mapping rows.
 */

export const metadata: Metadata = {
  title: {
    absolute: "ConvertMate Alternative (Free) — EliteVault",
  },
  description:
    "ConvertMate is shutting down. EliteVault is the free alternative: AI CRO audit with score, annotated screenshot and ranked fixes in 60 seconds — no card, nothing to install.",
  keywords: [
    "convertmate alternative",
    "convertmate shutting down",
    "convertmate replacement",
    "shopify cro tool",
    "ai cro audit",
    "shopify conversion optimization tool",
  ],
  alternates: { canonical: "/convertmate-alternative" },
  openGraph: {
    title: "ConvertMate Alternative (Free) — EliteVault",
    description:
      "ConvertMate is shutting down — here's the free alternative. AI CRO audit: score, annotated screenshot and ranked fixes in 60 seconds.",
    type: "website",
    url: `${baseUrl}/convertmate-alternative`,
  },
};

const FAQS = [
  {
    q: "Is EliteVault a free alternative to ConvertMate?",
    a: "Yes — the diagnosis is free. Paste your store URL and EliteVault returns a conversion score and an annotated screenshot at no cost, with no credit card. The prioritized fix list, buyer-persona simulation and unlimited audits are on Pro ($19/mo); the 7-day Meta Ads scenario modeler is on Scale ($49/mo).",
  },
  {
    q: "Do I need to install an app or code on my store?",
    a: "No. EliteVault works from your public URL — no Shopify app install, no script, no pixel, no prior traffic. That also means nothing to uninstall if you stop using it.",
  },
  {
    q: "How is EliteVault different from a product-description tool?",
    a: "ConvertMate focused on AI product-page optimization. EliteVault audits the whole store the way a senior CRO consultant would: hierarchy, offer clarity, trust, imagery, niche fit — then hands you a ranked punch-list of fixes, a buyer-persona reaction, and a library of revenue-validated winning stores to copy from.",
  },
  {
    q: "What should ConvertMate users do before it shuts down?",
    a: "Export anything you need from your ConvertMate account while it's still accessible, then run a free EliteVault audit on your store. You'll have a fresh, current diagnosis to work from instead of migrating stale recommendations.",
  },
];

// Old workflow → EliteVault mapping. Use-case based on purpose: it maps
// intents (verifiable on our side) instead of claiming ConvertMate
// feature specifics we can no longer verify.
const MIGRATION_ROWS = [
  {
    used: "AI recommendations to improve product pages",
    gets: "Full-store AI CRO audit: score, annotated screenshot, fixes ranked by leverage",
  },
  {
    used: "Guessing which changes move conversion",
    gets: "Buyer-persona simulation — watch your target customer react in their own voice",
  },
  {
    used: "Benchmarking against other Shopify stores",
    gets: "Library of revenue-validated winning stores, filterable by niche + image search",
  },
  {
    used: "Deciding when a page is 'ready' for paid traffic",
    gets: "7-day Meta Ads scenario modeler — 3 honest projections before you spend",
  },
];

const PROOF_POINTS = [
  { icon: Scan, text: "Audit in under 60 seconds, from just your URL" },
  { icon: Brain, text: "Niche-aware judgment — skincare is not supplements" },
  { icon: Library, text: "Winning-stores library validated by revenue signals" },
  { icon: ShieldCheck, text: "Free diagnosis · no credit card · nothing to install" },
];

export default function ConvertMateAlternativePage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "ConvertMate Alternative (Free) — EliteVault",
      url: `${baseUrl}/convertmate-alternative`,
      description:
        "ConvertMate is shutting down. EliteVault is the free alternative: AI CRO audit with score, annotated screenshot and ranked fixes in 60 seconds.",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "EliteVault",
          item: baseUrl,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "ConvertMate Alternative",
          item: `${baseUrl}/convertmate-alternative`,
        },
      ],
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
        {/* Hero — direct answer first (GEO: LLMs and Google extract from here) */}
        <div className="max-w-3xl">
          <DataPill items={["CONVERTMATE ALTERNATIVE", "FREE TO START"]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            ConvertMate is shutting down — here&apos;s the free alternative.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            ConvertMate, the AI conversion tool for Shopify product pages, has
            announced it is closing. If you used it to squeeze more conversion
            out of your store, EliteVault picks up where it left off — and goes
            further. Paste your URL and get a full AI CRO audit in under 60
            seconds: a conversion score, an annotated screenshot of exactly
            what&apos;s costing you sales, and a punch-list of fixes ranked by
            leverage. The diagnosis is free, with no credit card and nothing to
            install.
          </p>
          <p className="mt-4 max-w-2xl text-lg text-white/55 leading-relaxed">
            Where ConvertMate optimized individual product pages, EliteVault
            audits the whole store like a senior media buyer — and pairs the
            audit with a library of revenue-validated winning stores so you can
            copy what already converts in your niche.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/analyzer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                Audit my store free
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              60 seconds · no card · no install
            </span>
          </div>
        </div>

        {/* Proof points */}
        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF_POINTS.map((p) => (
            <div
              key={p.text}
              className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                <p.icon className="size-4 text-signal-300" />
              </div>
              <p className="mt-4 text-sm text-white/70 leading-relaxed">
                {p.text}
              </p>
            </div>
          ))}
        </section>

        {/* Migration mapping — what you used → what you get */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Moving from ConvertMate to EliteVault
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
            A use-case map, not a teardown: what you leaned on ConvertMate for,
            and what EliteVault gives you instead.
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.06] bg-card shadow-card">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="p-4 text-left font-normal text-xs uppercase tracking-wider text-white/40 w-1/2">
                    What you used ConvertMate for
                  </th>
                  <th className="p-4 text-left font-medium text-white w-1/2 bg-signal-600/[0.07] border-l border-signal-500/15">
                    What EliteVault gives you
                  </th>
                </tr>
              </thead>
              <tbody>
                {MIGRATION_ROWS.map((row, i) => (
                  <tr
                    key={row.used}
                    className={
                      i === MIGRATION_ROWS.length - 1
                        ? ""
                        : "border-b border-white/[0.04]"
                    }
                  >
                    <td className="p-4 text-white/60 leading-relaxed">
                      {row.used}
                    </td>
                    <td className="p-4 leading-relaxed text-white/85 bg-signal-600/[0.07] border-l border-signal-500/15">
                      <span className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {row.gets}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-white/30">
            ConvertMate described factually based on publicly available
            information as of July 2026. See the{" "}
            <Link href="/#compare" className="underline hover:text-white/60">
              full comparison table
            </Link>{" "}
            for how EliteVault stacks up against the wider CRO space.
          </p>
        </section>

        {/* FAQ (tied to FAQPage JSON-LD) */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            ConvertMate alternative — FAQ
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

        {/* Internal links — crawl paths + genuinely useful next steps */}
        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          <Link
            href="/free-website-audit"
            className="group rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card transition-colors hover:border-white/[0.14]"
          >
            <p className="font-medium text-white">
              Free Shopify store audit
              <ArrowRight className="ml-1.5 inline size-3.5 transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
              Score + annotated screenshot + ranked fixes, from just your URL.
            </p>
          </Link>
          <Link
            href="/winning-shopify-stores"
            className="group rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card transition-colors hover:border-white/[0.14]"
          >
            <p className="font-medium text-white">
              Winning Shopify stores library
              <ArrowRight className="ml-1.5 inline size-3.5 transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
              Revenue-validated winners, filterable by niche, with image search.
            </p>
          </Link>
        </section>

        {/* Final CTA */}
        <section className="mt-16 rounded-3xl border border-champagne-400/20 bg-champagne-400/[0.04] p-8 text-center">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-white">
            Don&apos;t migrate a tool. Upgrade the whole audit.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            Run the free diagnosis now — see your score and annotated screenshot
            before ConvertMate&apos;s lights go out.
          </p>
          <Link href="/sign-up?next=/app/analyzer">
            <span className="mt-5 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
              Audit my store free
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
