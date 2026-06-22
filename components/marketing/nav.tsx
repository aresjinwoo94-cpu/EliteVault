"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useT } from "@/components/i18n/locale-provider";

// SEO: surface the blog ("Guides") in the top nav. Every page renders the
// nav, so this gives the content hub an internal link from the whole site —
// not just the footer — which helps the guides get crawled and pass authority.
const NAV = [
  { key: "nav.analyzer", href: "/#analyzer" },
  { key: "nav.library", href: "/#library" },
  { key: "nav.pricing", href: "/#pricing" },
  { key: "nav.guides", href: "/blog" },
  { key: "nav.faq", href: "/#faq" },
  { key: "nav.about", href: "/about" },
];

export function MarketingNav() {
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled && "backdrop-blur-2xl bg-obsidian-950/60 border-b border-white/[0.04]",
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" aria-label="EliteVault home">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-1.5 text-sm text-white/60 hover:text-white transition-colors"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageToggle className="mr-1 hidden sm:inline-flex" />
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              {t("nav.signIn")}
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">{t("nav.startFree")}</Button>
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
