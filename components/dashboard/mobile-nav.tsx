"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, Sparkles, X } from "lucide-react";
import { PLANS } from "@/lib/stripe/plans";
import { useT } from "@/components/i18n/locale-provider";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BASE_NAV, isNavItemActive } from "@/components/dashboard/nav-items";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] | null;

/**
 * Mobile-only nav for the logged-in app shell. The desktop sidebar is
 * `hidden md:flex`, so on phones this hamburger + drawer is the ONLY way to
 * reach Overview / Analyzer / Trends / Library / Community / Billing / Settings.
 * Mounted on the left of the topbar (`md:hidden`).
 */
export function AppMobileNav({ profile }: { profile: Profile }) {
  const { t } = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isScale = PLANS[profile?.plan ?? "free"].unlocksScale;
  const NAV = BASE_NAV.filter((item) => !item.scaleOnly || isScale);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 md:hidden">
        <Dialog.Trigger asChild>
          <button
            type="button"
            aria-label={t("nav.openMenu")}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Menu className="size-5" />
          </button>
        </Dialog.Trigger>
        <Link href="/app" aria-label="EliteVault home">
          <Logo />
        </Link>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-obsidian-950/70 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 md:hidden" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-[60] flex w-[82vw] max-w-xs flex-col border-r border-white/[0.06] bg-obsidian-950/95 backdrop-blur-2xl p-5 shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left md:hidden">
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

          <nav className="mt-6 flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = isNavItemActive(item.href, path);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    active
                      ? "bg-white/[0.06] text-white"
                      : "text-white/60 hover:text-white hover:bg-white/[0.03]",
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-4 shrink-0",
                      active
                        ? "text-champagne-400"
                        : "text-white/40 group-hover:text-white/70",
                    )}
                  />
                  {t(item.key)}
                  {item.highlight && (
                    <Sparkles className="ml-auto size-3 text-signal-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 rounded-xl border border-white/[0.06] p-4 bg-gradient-to-br from-signal-600/[0.08] to-champagne-400/[0.05]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-white/40">
                {t("sidebar.planLabel")}
              </span>
              <Badge variant={profile?.plan === "free" ? "default" : "gold"}>
                {(profile?.plan ?? "free").toUpperCase()}
              </Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="num text-3xl text-gold-gradient">
                {profile?.credits ?? 0}
              </span>
              <span className="text-xs text-white/40">
                {t("sidebar.creditsLeft")}
              </span>
            </div>
            {profile?.plan === "free" && (
              <Link
                href="/app/billing"
                onClick={() => setOpen(false)}
                className="mt-3 flex min-h-11 items-center text-xs text-champagne-400 hover:text-champagne-300 transition-colors"
              >
                {t("sidebar.upgradeCta")} →
              </Link>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
