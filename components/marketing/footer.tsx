"use client";

import { useId } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useT } from "@/components/i18n/locale-provider";
import { PaymentMarks } from "@/components/billing/payment-marks";

export function Footer() {
  const { t } = useT();
  const weAcceptId = useId();
  return (
    <footer className="border-t border-white/[0.04] py-12">
      <div className="container max-w-6xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <Logo />
            <p className="mt-3 text-xs text-white/40 max-w-sm">
              {t("footer.tagline")} © {new Date().getFullYear()}
            </p>
            <LanguageToggle className="mt-4" />
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-white/50 sm:grid-cols-3 lg:grid-cols-4">
            {/* Point at the dedicated /pricing money landing (it carries the
                SoftwareApplication + offers JSON-LD) rather than the home
                anchor, so the page gets a descriptive-anchor internal link. */}
            <Link href="/pricing" className="hover:text-white">
              {t("footer.pricing")}
            </Link>
            <Link href="/#faq" className="hover:text-white">
              {t("footer.faq")}
            </Link>
            <Link href="/free-website-audit" className="hover:text-white">
              {t("footer.freeAudit")}
            </Link>
            <Link href="/ai-buyer-persona-simulator" className="hover:text-white">
              {t("footer.persona")}
            </Link>
            <Link href="/meta-ads-forecast" className="hover:text-white">
              {t("footer.metaAds")}
            </Link>
            <Link href="/winning-shopify-stores" className="hover:text-white">
              {t("footer.winners")}
            </Link>
            <Link href="/convertmate-alternative" className="hover:text-white">
              {t("footer.convertmate")}
            </Link>
            <Link href="/blog" className="hover:text-white">
              {t("footer.blog")}
            </Link>
            <Link href="/about" className="hover:text-white">
              {t("footer.about")}
            </Link>
            <Link href="/support" className="hover:text-white">
              {t("footer.support")}
            </Link>
            <Link href="/docs/api" className="hover:text-white">
              {t("footer.api")}
            </Link>
            <Link href="/sign-in" className="hover:text-white">
              {t("footer.signIn")}
            </Link>
            <Link href="/legal/privacy" className="hover:text-white">
              {t("footer.privacy")}
            </Link>
            <Link href="/legal/terms" className="hover:text-white">
              {t("footer.terms")}
            </Link>
            <Link href="/legal/refunds" className="hover:text-white">
              {t("footer.refunds")}
            </Link>
          </nav>
        </div>
        {/* "We accept" — the same brand chips as the checkout, derived from the
            methods Stripe is configured with (lib/stripe/payment-method-types),
            so the footer can never promise a method checkout doesn't offer. */}
        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.04] pt-6">
          <span
            id={weAcceptId}
            className="text-[11px] uppercase tracking-widest text-white/35"
          >
            {t("footer.weAccept")}
          </span>
          <PaymentMarks aria-labelledby={weAcceptId} chipClassName="text-white/45" />
        </div>
      </div>
    </footer>
  );
}
