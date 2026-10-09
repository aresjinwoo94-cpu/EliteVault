"use client";

import { LayoutTemplate, Repeat, Search, Target } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";

/**
 * "What you'll discover" strip directly under the hero: four homogeneous cards,
 * one Lucide icon (single weight, teal accent), a Rubik-semibold line and a muted
 * one-line sub.
 *
 * HONESTY: every card must be TRUE of the product. They map 1:1 to the Analyzer's
 * Fix Tracks (docs/store-audit-fix-tracks-premium.md §2.5): 1 → post_purchase,
 * 2 → theme_colors, 3 → the annotated screenshot (unchanged), 4 → competitor.
 * Card 1 is only honest because the post_purchase track ships in the SAME change.
 * No hard % numbers — the brand disclaims "estimates, not guarantees".
 *
 * Grid: 4 across on desktop, 2×2 on tablet, 1 column on mobile — identical
 * sizes/alignment across all four. Single teal accent, 1px borders, radii 6–12px.
 */
const BENEFITS: {
  icon: typeof Repeat;
  titleKey: string;
  subKey: string;
}[] = [
  { icon: Repeat, titleKey: "socialStrip.b1Title", subKey: "socialStrip.b1Sub" },
  { icon: LayoutTemplate, titleKey: "socialStrip.b2Title", subKey: "socialStrip.b2Sub" },
  { icon: Search, titleKey: "socialStrip.b3Title", subKey: "socialStrip.b3Sub" },
  { icon: Target, titleKey: "socialStrip.b4Title", subKey: "socialStrip.b4Sub" },
];

export function SocialStrip() {
  const { t } = useT();
  return (
    <section aria-label={t("socialStrip.eyebrow")} className="relative">
      <div className="container max-w-[1280px]">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.15em] text-white/40">
          {t("socialStrip.eyebrow")}
        </p>
        <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <li
              key={b.titleKey}
              className="glow-card flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] p-5"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                <b.icon className="size-4 text-signal-300" />
              </span>
              <p className="mt-4 font-serif text-sm leading-snug text-white">
                {t(b.titleKey)}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                {t(b.subKey)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
