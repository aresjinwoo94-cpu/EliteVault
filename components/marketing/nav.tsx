"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
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
  const [mobileOpen, setMobileOpen] = useState(false);
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
          <Link href="/sign-in" className="hidden sm:inline-flex">
            <Button variant="ghost" size="sm">
              {t("nav.signIn")}
            </Button>
          </Link>
          <Link href="/sign-up" className="hidden sm:inline-flex">
            <Button size="sm">{t("nav.startFree")}</Button>
          </Link>

          {/* Mobile menu trigger — the desktop nav is `hidden md:flex`, so
              without this the whole site is unreachable on phones. */}
          <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label={t("nav.openMenu")}
                className="md:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                <Menu className="size-5" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[60] bg-obsidian-950/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
              <Dialog.Content
                className="fixed inset-y-0 right-0 z-[60] flex w-[82vw] max-w-sm flex-col border-l border-white/[0.06] bg-obsidian-950/95 backdrop-blur-2xl p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
              >
                <Dialog.Title className="sr-only">{t("nav.menu")}</Dialog.Title>
                <div className="flex items-center justify-between">
                  <Logo />
                  <Dialog.Close
                    aria-label={t("nav.closeMenu")}
                    className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors"
                  >
                    <X className="size-5" />
                  </Dialog.Close>
                </div>

                <nav className="mt-8 flex flex-col">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex min-h-11 items-center border-b border-white/[0.04] text-base text-white/75 hover:text-white transition-colors"
                    >
                      {t(item.key)}
                    </Link>
                  ))}
                </nav>

                <div className="mt-auto flex flex-col gap-3 pt-8">
                  <LanguageToggle className="self-start" />
                  <Link href="/sign-in" onClick={() => setMobileOpen(false)}>
                    <Button variant="ghost" className="w-full min-h-11">
                      {t("nav.signIn")}
                    </Button>
                  </Link>
                  <Link href="/sign-up" onClick={() => setMobileOpen(false)}>
                    <Button className="w-full min-h-11">{t("nav.startFree")}</Button>
                  </Link>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </motion.header>
  );
}
