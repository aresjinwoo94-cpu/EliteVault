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
import { localizePlan } from "@/lib/i18n/plan-text";
import type { PlanTier } from "@/lib/supabase/types";
import { FAQ_ITEMS, faqPageJsonLd } from "@/lib/content/faq";
import { COMPANY } from "@/lib/company";
import { getT } from "@/lib/i18n/server";
import { Rich } from "@/components/i18n/rich";

export const metadata: Metadata = {
  title: "Help center",
  description:
    "Onboarding, billing, usage limits, reading your score, and how to contact EliteVault support.",
  alternates: { canonical: "/support" },
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

export default async function SupportPage() {
  const { t } = await getT();
  // FAQPage — the Help center renders FAQ_ITEMS below, so the structured data
  // is backed by visible on-page content (Google's requirement for FAQ rich
  // results). Same shared source as the marketing FAQ, so answers never drift.
  const faqJsonLd = faqPageJsonLd();
  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-3xl py-24 md:py-32">
          <p className="text-xs uppercase tracking-widest text-white/40">
            {t("supportPage.eyebrow")}
          </p>
          <h1 className="mt-2 font-serif text-3xl md:text-4xl tracking-tight">
            {t("supportPage.title")}
          </h1>
          <p className="mt-2 text-sm text-white/55 leading-relaxed">
            <Rich
              text={t("supportPage.intro")}
              tags={{
                c: (c) => (
                  <Link
                    href="/support/contact"
                    className="text-champagne-400 hover:text-champagne-300"
                  >
                    {c}
                  </Link>
                ),
                m: () => (
                  <a
                    href={`mailto:${COMPANY.contactEmail}`}
                    className="text-champagne-400 hover:text-champagne-300"
                  >
                    {COMPANY.contactEmail}
                  </a>
                ),
              }}
            />
          </p>

          <div className="mt-10 space-y-4">
            <Section icon={Rocket} title={t("supportPage.gettingStarted")}>
              <p>{t("supportPage.gettingStartedBody")}</p>
            </Section>

            <Section icon={CreditCard} title={t("supportPage.billing")}>
              <p>
                <Rich
                  text={t("supportPage.billingBody")}
                  tags={{
                    l: (c) => (
                      <Link
                        href="/legal/refunds"
                        className="text-champagne-400 hover:text-champagne-300"
                      >
                        {c}
                      </Link>
                    ),
                  }}
                />
              </p>
            </Section>

            <Section icon={Gauge} title={t("supportPage.limits")}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-white/40 border-b border-white/[0.06]">
                      <th className="py-2 pr-4 font-medium">{t("home.plan")}</th>
                      <th className="py-2 px-2 font-medium text-right">
                        {t("supportPage.auditsMo")}
                      </th>
                      <th className="py-2 pl-2 font-medium text-right">
                        {t("supportPage.trackedNiches")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {TIERS.map((tier) => {
                      const p = localizePlan(PLANS[tier], t);
                      return (
                        <tr key={tier} className="border-b border-white/[0.04]">
                          <td className="py-2 pr-4 text-white/80">
                            {p.name}
                            {tier !== "free" && (
                              <span className="text-white/35">
                                {" "}· ${p.price.month}/mo
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-white/70">
                            {p.quotas.analysesPerMonth}
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
                <Rich
                  text={t("supportPage.limitsNote")}
                  tags={{
                    l: (c) => (
                      <Link href="/#pricing" className="text-champagne-400 hover:text-champagne-300">
                        {c}
                      </Link>
                    ),
                  }}
                />
              </p>
            </Section>

            <Section icon={BarChart3} title={t("supportPage.score")}>
              <p>
                <Rich
                  text={t("supportPage.scoreBody")}
                  tags={{ b: (c) => <strong className="text-white/85">{c}</strong> }}
                />
              </p>
            </Section>

            <Section icon={AlertTriangle} title={t("supportPage.fails")}>
              <p>
                <Rich
                  text={t("supportPage.failsBody")}
                  tags={{
                    b: (c) => <strong className="text-white/85">{c}</strong>,
                    l: (c) => (
                      <Link
                        href="/support/contact"
                        className="text-champagne-400 hover:text-champagne-300"
                      >
                        {c}
                      </Link>
                    ),
                  }}
                />
              </p>
            </Section>

            <Section icon={ShieldCheck} title={t("supportPage.privacy")}>
              <p>
                <Rich
                  text={t("supportPage.privacyBody")}
                  tags={{
                    b: (c) => <strong className="text-white/85">{c}</strong>,
                    l: (c) => (
                      <Link
                        href="/legal/privacy"
                        className="text-champagne-400 hover:text-champagne-300"
                      >
                        {c}
                      </Link>
                    ),
                  }}
                />
              </p>
            </Section>
          </div>

          {/* FAQ (shared source) */}
          <section className="mt-12">
            <h2 className="font-serif text-2xl tracking-tight">
              {t("supportPage.faq")}
            </h2>
            <div className="mt-5 space-y-4">
              {FAQ_ITEMS.map((item, i) => (
                <div key={item.q}>
                  <p className="text-sm font-medium text-white/90">
                    {t(`faqContent.q${i}`)}
                  </p>
                  <p className="mt-1 text-sm text-white/55 leading-relaxed">
                    {t(`faqContent.a${i}`)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-12 rounded-2xl border border-champagne-400/20 bg-champagne-400/[0.03] p-6 text-center">
            <p className="text-sm text-white/70">{t("supportPage.stuck")}</p>
            <Link
              href="/support/contact"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-champagne-400 px-5 py-3 text-sm font-medium text-obsidian-950 hover:bg-champagne-300 transition-colors"
            >
              {t("contactPage.title")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
