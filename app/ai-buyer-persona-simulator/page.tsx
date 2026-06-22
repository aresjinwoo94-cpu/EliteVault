import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Users,
  MessageSquareText,
  Eye,
  Target,
  Sparkles,
  ThumbsDown,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elitevaultapp.com";

export const metadata: Metadata = {
  title: "AI Buyer Persona Simulator for Ecommerce Stores",
  description:
    "Simulate how a real buyer persona reacts to your store. EliteVault's AI buyer-persona simulator reads your page as your target customer and tells you exactly where they'd bounce — and why.",
  keywords: [
    "ai buyer persona simulator",
    "buyer persona simulator",
    "buyer persona generator",
    "customer persona simulation",
    "ai persona",
    "target audience simulator",
    "ecommerce buyer persona",
    "shopper simulation",
  ],
  alternates: { canonical: "/ai-buyer-persona-simulator" },
  openGraph: {
    title: "AI Buyer Persona Simulator — EliteVault",
    description:
      "Watch a buyer persona react to your store in their own voice, then see where the offer loses them. Free to start.",
    type: "website",
    url: `${baseUrl}/ai-buyer-persona-simulator`,
  },
};

const STEPS = [
  {
    icon: Target,
    label: "Choose your buyer",
    body: "Pick a persona — age, gender, country and interests — or describe a custom one in a sentence. The exact customer your ads are sending.",
  },
  {
    icon: Eye,
    label: "AI reads your store as them",
    body: "A vision model lands on your page with that persona's priorities, patience and skepticism — and reacts the way a first-time visitor actually would.",
  },
  {
    icon: MessageSquareText,
    label: "Hear them think out loud",
    body: "You get their reaction in their own voice — what grabs them, what confuses them, and the moment they'd reach for the back button.",
  },
];

const WHY = [
  {
    icon: ThumbsDown,
    label: "Find the bounce moment",
    body: '"I\'d bounce — the offer isn\'t obvious in the first 2 seconds" tells you more than any heatmap. You learn exactly where desire dies.',
  },
  {
    icon: Users,
    label: "Test multiple personas",
    body: "Your store reads differently to a 24-year-old on TikTok than to a 38-year-old parent. Simulate each and see which one your page is built for.",
  },
  {
    icon: Sparkles,
    label: "Objective, every time",
    body: "You've seen your store 300 times — you can't react like a stranger anymore. To the model, every visit is the first.",
  },
];

const FAQS = [
  {
    q: "What is an AI buyer persona simulator?",
    a: "It's a tool that has an AI react to your store as a specific target customer — a defined persona with an age, location and interests. Instead of generic advice, you get how that buyer experiences your page: what convinces them and where they'd leave.",
  },
  {
    q: "How is this different from a buyer persona generator?",
    a: "A generator writes a persona profile. A simulator puts that persona to work: it reacts to your actual store URL in the persona's voice, so you see real friction on your real page — not a template document.",
  },
  {
    q: "Can I simulate more than one persona?",
    a: "Yes. Run different personas (e.g. young female US shopper vs. a 30s parent) against the same store and compare reactions. It's the fastest way to see whether your page matches the audience your ads target.",
  },
  {
    q: "Is the buyer-persona simulation free?",
    a: "You start free: create an account and run a free audit of your store (overall score + annotated screenshot). The full buyer-persona simulation is part of the Pro plan, alongside your prioritized fixes and unlimited audits.",
  },
  {
    q: "Is the persona reaction a prediction?",
    a: "No — it's a high-quality estimate of how a buyer in that segment is likely to react, not a guarantee of behavior. Use it to find obvious friction fast, then validate the fixes with your real traffic.",
  },
];

export default function BuyerPersonaSimulatorPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "EliteVault — AI Buyer Persona Simulator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `${baseUrl}/ai-buyer-persona-simulator`,
      description:
        "AI buyer-persona simulator for ecommerce: an AI reacts to your store as your target customer and shows where the offer loses them.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Start free — run a free store audit, then unlock persona simulation on Pro.",
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
          <DataPill items={["AI BUYER PERSONA SIMULATOR", "REACTS LIKE A REAL SHOPPER"]} />
          <h1 className="mt-5 font-serif text-4xl md:text-6xl tracking-tight leading-[1.05]">
            See your store through your buyer&apos;s eyes — before they bounce
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/55 leading-relaxed">
            EliteVault&apos;s AI buyer-persona simulator lands on your store as
            your target customer and reacts in their own voice — what grabs
            them, what confuses them, and the exact moment they&apos;d leave.
            Stop guessing how shoppers feel about your page and watch one react.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up?next=/app/analyzer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-6 py-3 text-base font-medium text-obsidian-950 shadow-gold transition-colors hover:bg-champagne-300">
                Simulate a buyer on my store
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-white/40">
              free to start · no credit card
            </span>
          </div>
        </div>

        {/* How it works */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            How the buyer-persona simulation works
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-white/55 leading-relaxed">
            Three steps from &ldquo;I think my store is fine&rdquo; to
            &ldquo;oh, that&apos;s where I&apos;m losing them.&rdquo;
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span className="num text-2xl text-gold-gradient">{i + 1}</span>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                    <s.icon className="size-4 text-signal-300" />
                  </div>
                </div>
                <h3 className="mt-4 font-medium text-white">{s.label}</h3>
                <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Persona quote showcase */}
        <section className="mt-20 rounded-3xl border border-white/[0.06] bg-card p-6 shadow-card md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
                A reaction, not a report
              </h2>
              <p className="mt-3 text-sm text-white/55 leading-relaxed">
                Analytics tell you <em>that</em> people left. A buyer persona
                tells you <em>why</em>. Pair the simulation with your annotated
                conversion score and you stop optimizing in the dark.
              </p>
              <Link
                href="/blog/why-your-shopify-store-isnt-converting"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-signal-300 hover:text-signal-200"
              >
                Why your store isn&apos;t converting
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="shrink-0 md:max-w-xs">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-sm text-white/75 leading-relaxed">
                  &ldquo;I&apos;d bounce — the offer isn&apos;t obvious in the
                  first 2 seconds, and I don&apos;t see a single review.&rdquo;
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-white/35">
                  — buyer persona · F 28-34 · US
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why it matters */}
        <section className="mt-20">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Why founders run a persona before scaling ads
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHY.map((c) => (
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

        {/* FAQ */}
        <section className="mt-20 max-w-2xl">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            AI buyer persona simulator — FAQ
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
            Watch a buyer react to your store
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/55 leading-relaxed">
            Start with a free audit — score and annotated screenshot — then
            unlock the full buyer-persona simulation on Pro.
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
