"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOut } from "@/app/actions/auth";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useT } from "@/components/i18n/locale-provider";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"] | null;

export function AppTopbar({ profile }: { profile: Profile }) {
  const { t } = useT();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes("mac"));
  }, []);

  const initials = (profile?.full_name ?? profile?.email ?? "EV")
    .split(/[\s@]/)
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between px-6 border-b border-white/[0.04] bg-obsidian-950/60 backdrop-blur-2xl">
      <button
        onClick={() =>
          window.dispatchEvent(new CustomEvent("ev:open-command-menu"))
        }
        className="group flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-sm text-white/50 hover:text-white hover:border-white/[0.12] transition-all min-w-[260px]"
      >
        <Search className="size-3.5" />
        {t("topbar.quickSearch")}
        <kbd className="ml-auto rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-white/40">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <div className="flex items-center gap-3">
        <LanguageToggle />
        <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full focus:outline-none">
          <Avatar>
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{profile?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/app/settings">{t("topbar.settings")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/app/billing">{t("topbar.billing")}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/support">{t("topbar.helpSupport")}</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <button type="submit" className="w-full">
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <LogOut className="size-4" />
                {t("topbar.signOut")}
              </DropdownMenuItem>
            </button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
