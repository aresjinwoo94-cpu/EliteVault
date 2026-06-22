"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  locales,
  type Locale,
} from "@/lib/i18n/config";
import { useT } from "./locale-provider";

/**
 * EN / ES segmented toggle. Sets the NEXT_LOCALE cookie client-side and
 * calls router.refresh() so every Server Component re-renders reading the
 * new cookie — no full reload, no flash. Works the same on marketing pages
 * and inside the app.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale } = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5 text-[11px] font-medium",
        pending && "opacity-60",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-full px-2 py-0.5 uppercase tracking-wide transition-colors",
            locale === l
              ? "bg-white/[0.10] text-white"
              : "text-white/45 hover:text-white/80",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
