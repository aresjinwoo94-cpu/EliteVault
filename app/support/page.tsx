import type { Metadata } from "next";
import Link from "next/link";
import {
  Rocket,
  CreditCard,
  Gauge,
  BarChart3,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { PLANS } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";
import { FAQ_ITEMS } from "@/lib/content/faq";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Help center",
  description:
    "Onboarding, billing, usage limits, reading your score, and how to contact EliteVault support.",
};

const TIERS: PlanTier[] = ["free", "pro", "scale"];

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Rocket;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] bg-card/40 p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium text-white">
        <Icon className="size-4 text-champagne-300" />
        {title}
      </h2>
      <div className="mt-3 text-sm text-white/60 leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-3xl py-24 md:py-32">
          <p className="text-xs uppercase tracking-widest text-white/40">
            Support
          </p>
          <h1 className="mt-2 font-serif text-3xl md:text-4xl tracking-tight">
            Help center
          </h1>
          <p className="mt-2 text-sm text-white/55 leading-relaxed">
            Answers to the most common questions. Can&apos;t find what you
            need?{" "}
            <Link
              href="/support/contact"
              className="text-champagne-400 hover:text-champagne-300"
            >
              Contact support
            </Link>{" "}
            or email{" "}
            <a
              href={`mailto:${COMPANY.contactEmail}`}
              className="text-champagne-400 hover:text-champagne-300"
            >
              {COMPANY.contactEmail}
            </a>
            .
          </p>

          <div className="mt-10 space-y-4">
            <Section icon={Rocket} title="Getting started">
              <p>
                Create your account, then paste your store URL into the Analyzer.
                You&apos;ll get a conversion score and your top fix in under a
                minute. Your first audit is free — no card required.
              </p>
            </Section>

            <Section icon={CreditCard} title="Billing & cancellation">
              <p>
                Plans are billed in advance through Stripe and renew until
                cancelled. Manage or cancel anytime in the Stripe Customer
                Portal (Billing → Manage subscription) — you keep access until
                the end of the period you paid for. Full details in our{" "}
                <Link
                  href="/legal/refunds"
                  className="text-champagne-400 hover:text-champagne-300"
                >
                  Refund &amp; Cancellation Policy
                </Link>
                .
              </p>
            </Section>

            <Section icon={Gauge} title="Usage limits by plan">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
                      <th className="py-2 pr-4 font-medium">Plan</th>
                      <th className="py-2 px-2 font-medium text-right">Audits / mo</th>
                      <th className="py-2 px-2 font-medium text-right">Competitors</th>
                      <th className="py-2 pl-2 font-medium text-right">Tracked niches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TIERS.map((t) => {
                      const p = PLANS[t];
                      return (
                        <tr key={t} className="border-b border-white/[0.04]">
                          <td className="py-2 pr-4 text-white/80">
                            {p.name}
                            {t !== "free" && (
                              <span className="text-white/35">
                                {" "}· ${p.price.month}/mo
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-white/70">
                            {p.quotas.analysesPerMonth}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-white/70">
                            {p.quotas.monitoredCompetitors}
                          </td>
                          <td className="py-2 pl-2 text-right tabular-nums text-white/70">
                            {p.quotas.trackedNiches}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-white/40">
                Limits are enforced per billing period. Need more?{" "}
                <Link href="/#pricing" className="text-champagne-400 hover:text-champagne-300">
                  Compare plans
                </Link>
                .
              </p>
            </Section>

            <Section icon={BarChart3} title="Reading your score">
              <p>
                Your overall score (0–100) is a fast conversion estimate built
                from six category scores — color, layout, imagery, technical,
                niche fit, and CRO principles. It&apos;s a{" "}
                <strong className="text-white/85">directional estimate</strong>,
                not a guarantee. Use the ranked fixes to find the highest-leverage
                changes first.
              </p>
            </Section>

            <Section icon={AlertTriangle} title="If an analysis fails">
              <p>
                Occasionally a site blocks screenshots or the AI provider is
                briefly overloaded. When an audit fails, your credit is{" "}
                <strong className="text-white/85">automatically refunded</strong>{" "}
                and you can retry. If it keeps failing, try uploading a screenshot
                manually, or{" "}
                <Link
                  href="/support/contact"
                  className="text-champagne-400 hover:text-champagne-300"
                >
                  contact us
                </Link>
                .
              </p>
            </Section>

            <Section icon={ShieldCheck} title="Data & privacy">
              <p>
                Your URLs, screenshots, and audits are private to your account.
                We process them with Google Gemini to generate your result and{" "}
                <strong className="text-white/85">
                  never train AI models on your content
                </strong>
                . See the{" "}
                <Link
                  href="/legal/privacy"
                  className="text-champagne-400 hover:text-champagne-300"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </Section>
          </div>

          {/* FAQ (shared source) */}
          <section className="mt-12">
            <h2 className="font-serif text-2xl tracking-tight">
              Frequently asked
            </h2>
            <div className="mt-5 space-y-4">
              {FAQ_ITEMS.map((item) => (
                <div key={item.q}>
                  <p className="text-sm font-medium text-white/90">{item.q}</p>
                  <p className="mt-1 text-sm text-white/55 leading-relaxed">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-12 rounded-2xl border border-champagne-400/20 bg-champagne-400/[0.03] p-6 text-center">
            <p className="text-sm text-white/70">Still stuck?</p>
            <Link
              href="/support/contact"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-5 py-2.5 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors"
            >
              Contact support
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
