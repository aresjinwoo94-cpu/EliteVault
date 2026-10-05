import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { Rich } from "@/components/i18n/rich";
import { fill } from "@/lib/i18n/lookup";
import { COMPANY, socialUrls } from "@/lib/company";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why EliteVault exists, who builds it, and how to reach us — honest CRO audits for ecommerce founders.",
  // Self-referential canonical. Previously this page inherited the root
  // layout's default canonical of "/", which told Google /about was a
  // duplicate of the homepage.
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const { t } = await getT();
  const socials = socialUrls();

  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">
        <div className="container max-w-3xl py-24 md:py-32">
          <p className="text-xs uppercase tracking-widest text-white/40">
            {t("aboutPage.eyebrow")}
          </p>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
            <Rich
              text={t("aboutPage.headline")}
              tags={{ g: (c) => <span className="text-gold-gradient">{c}</span> }}
            />
          </h1>

          <div className="mt-8 space-y-5 text-white/65 leading-relaxed">
            <p>
              {t("aboutPage.p1")}
            </p>
            <p>
              {fill(t("aboutPage.p2"), { name: COMPANY.name })}
            </p>
            <p>
              {/* Brief §5 — aligned to the canonical framing (§3). Additive
                  only; no protection weakened. FLAG FOR HUMAN REVIEW. */}
              <Rich
                text={t("aboutPage.p3")}
                tags={{ b: (c) => <strong className="text-white/85">{c}</strong> }}
              />
            </p>
          </div>

          {/* Founder */}
          <section className="mt-14">
            <h2 className="font-serif text-2xl tracking-tight">{t("aboutPage.whoBuilds")}</h2>
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
                  {t("aboutPage.bio")}
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
            <h2 className="font-serif text-2xl tracking-tight">{t("aboutPage.company")}</h2>
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-card/40 p-6 text-sm text-white/60 space-y-2">
              <p>
                <span className="text-white/40">{t("aboutPage.operatedBy")}</span>{" "}
                <strong className="text-white/85">{COMPANY.legalEntity}</strong>
              </p>
              <p>
                <span className="text-white/40">{t("aboutPage.basedIn")}</span>{" "}
                {COMPANY.country}
              </p>
              <p>
                <span className="text-white/40">{t("aboutPage.address")}</span>{" "}
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
                {t("aboutPage.seeOur")}{" "}
                <Link href="/legal/privacy" className="underline hover:text-white/60">
                  {t("aboutPage.privacy")}
                </Link>
                ,{" "}
                <Link href="/legal/terms" className="underline hover:text-white/60">
                  {t("aboutPage.terms")}
                </Link>{" "}
                {t("aboutPage.and")}{" "}
                <Link href="/legal/refunds" className="underline hover:text-white/60">
                  {t("aboutPage.refund")}
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
              {t("aboutPage.cta")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
