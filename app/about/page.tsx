import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { COMPANY, socialUrls } from "@/lib/company";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why EliteVault exists, who builds it, and how to reach us — honest CRO audits for ecommerce founders.",
};

export default function AboutPage() {
  const socials = socialUrls();

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-3xl py-24 md:py-32">
          <p className="text-xs uppercase tracking-widest text-white/40">
            About
          </p>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
            A senior CRO audit — without the{" "}
            <span className="italic text-gold-gradient">$2,000 invoice</span>.
          </h1>

          <div className="mt-8 space-y-5 text-white/65 leading-relaxed">
            <p>
              Hiring a conversion consultant to tear down your store costs
              hundreds to thousands of dollars and takes weeks. Most ecommerce
              founders never do it — so they keep guessing about what&apos;s
              costing them sales.
            </p>
            <p>
              {COMPANY.name} exists to collapse that into something anyone can
              run: paste your URL and get a brutal, structured audit in under a
              minute — a real conversion score, an annotated screenshot, a
              buyer-persona simulation, and a ranked list of fixes. The same
              instincts a senior media buyer would have in the first five
              seconds, on demand.
            </p>
            <p>
              We&apos;re deliberately honest about what this is: the scores and
              projections are{" "}
              <strong className="text-white/85">
                AI-generated estimates, not guarantees
              </strong>
              . They&apos;re a fast, repeatable second opinion to point you at
              the highest-leverage changes — not a promise of results.
            </p>
          </div>

          {/* Founder */}
          <section className="mt-14">
            <h2 className="font-serif text-2xl tracking-tight">Who builds it</h2>
            <div className="mt-5 flex items-start gap-4 rounded-2xl border border-white/[0.06] bg-card/40 p-6">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-champagne-400/15 ring-1 ring-champagne-400/25 font-serif text-champagne-200">
                {COMPANY.founder.initials}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-white">{COMPANY.founder.name}</p>
                <p className="text-sm text-white/45">{COMPANY.founder.role}</p>
                <p className="mt-3 text-sm text-white/60 leading-relaxed">
                  {/* TODO(founder): replace with a real, honest bio — background,
                      why you built EliteVault. Do not fabricate credentials. */}
                  EliteVault is built by a small, founder-led team obsessed with
                  ecommerce conversion. We use the product on real stores every
                  week and ship improvements based on what actually moves scores.
                </p>
                {socials.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {socials.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-champagne-400 hover:text-champagne-300"
                      >
                        {new URL(url).hostname.replace(/^www\./, "")}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Company / contact */}
          <section className="mt-12">
            <h2 className="font-serif text-2xl tracking-tight">Company</h2>
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-card/40 p-6 text-sm text-white/60 space-y-2">
              <p>
                <span className="text-white/40">Operated by:</span>{" "}
                <strong className="text-white/85">{COMPANY.legalEntity}</strong>
              </p>
              <p>
                <span className="text-white/40">Based in:</span>{" "}
                {COMPANY.country}
              </p>
              <p>
                <span className="text-white/40">Address:</span>{" "}
                {COMPANY.address}
              </p>
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-white/40" />
                <a
                  href={`mailto:${COMPANY.contactEmail}`}
                  className="text-champagne-400 hover:text-champagne-300"
                >
                  {COMPANY.contactEmail}
                </a>
              </p>
              <p className="pt-2 text-xs text-white/35">
                See our{" "}
                <Link href="/legal/privacy" className="underline hover:text-white/60">
                  Privacy Policy
                </Link>
                ,{" "}
                <Link href="/legal/terms" className="underline hover:text-white/60">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/legal/refunds" className="underline hover:text-white/60">
                  Refund Policy
                </Link>
                .
              </p>
            </div>
          </section>

          {/* CTA */}
          <div className="mt-14 text-center">
            <Link
              href="/sign-up?next=/app/analyzer"
              className="inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-5 py-3 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors"
            >
              Audit your store free
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
