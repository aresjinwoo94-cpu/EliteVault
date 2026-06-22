"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useT } from "@/components/i18n/locale-provider";

export function Footer() {
  const { t } = useT();
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
          <nav className="grid grid-cols-2 md:flex gap-x-8 gap-y-2 text-sm text-white/50">
            <Link href="/#pricing" className="hover:text-white">
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
      </div>
    </footer>
  );
}
