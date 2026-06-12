"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  Compass,
  Globe,
  KeyRound,
  Library,
  Radar,
  Scan,
  Settings,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { PLANS } from "@/lib/stripe/plans";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] | null;

const BASE_NAV: Array<{
  label: string;
  href: string;
  icon: typeof Compass;
  highlight?: boolean;
  scaleOnly?: boolean;
}> = [
  { label: "Overview", href: "/app", icon: Compass },
  { label: "Analyzer", href: "/app/analyzer", icon: Scan, highlight: true },
  { label: "Trends", href: "/app/trends", icon: TrendingUp },
  { label: "Monitor", href: "/app/monitor", icon: Radar },
  { label: "Library", href: "/app/library", icon: Library },
  { label: "Community", href: "/app/community", icon: Globe },
  { label: "API keys", href: "/app/settings/api-keys", icon: KeyRound, scaleOnly: true },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
  { label: "Settings", href: "/app/settings", icon: Settings },
];

export function AppSidebar({ profile }: { profile: Profile }) {
  const path = usePathname();
  const isScale = PLANS[profile?.plan ?? "free"].unlocksScale;
  const NAV = BASE_NAV.filter((item) => !item.scaleOnly || isScale);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/[0.04] bg-obsidian-950/40 backdrop-blur-xl">
      <div className="p-5">
        <Link href="/app" aria-label="EliteVault home">
          <Logo />
        </Link>
      </div>

      {/*
        Nav is no longer `flex-1` — the plan card now lives RIGHT BELOW
        the nav items (so it visually sits attached to "Settings"), not
        pinned to the bottom of the sidebar. Extra `flex-1` spacer
        afterwards eats any leftover vertical space so the cluster stays
        anchored at the top of the column.
      */}
      <nav className="px-3 py-2 space-y-0.5">
        {NAV.map((item) => {
          // Settings should NOT match nested /app/settings/api-keys —
          // require exact match for /app and /app/settings, prefix for the rest.
          const exactMatchRoutes = new Set(["/app", "/app/settings"]);
          const active = exactMatchRoutes.has(item.href)
            ? path === item.href
            : path?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-white/[0.06] text-white"
                  : "text-white/55 hover:text-white hover:bg-white/[0.03]",
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
              {item.label}
              {item.highlight && (
                <Sparkles className="ml-auto size-3 text-signal-400" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 mt-2 rounded-xl border border-white/[0.06] p-4 bg-gradient-to-br from-signal-600/[0.08] to-champagne-400/[0.05]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            Plan
          </span>
          <Badge variant={profile?.plan === "free" ? "default" : "gold"}>
            {(profile?.plan ?? "free").toUpperCase()}
          </Badge>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono tabular-nums text-3xl text-gold-gradient tnum">
            {profile?.credits ?? 0}
          </span>
          <span className="text-xs text-white/40">credits left</span>
        </div>
        {profile?.plan === "free" && (
          <Link
            href="/app/billing"
            className="mt-3 block text-xs text-champagne-400 hover:text-champagne-300 transition-colors"
          >
            Upgrade to Pro →
          </Link>
        )}
      </div>

      {/* Spacer so the cluster stays at the top — without this the
          flex-col would distribute children evenly. */}
      <div className="flex-1" />
    </aside>
  );
}
