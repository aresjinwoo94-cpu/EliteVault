"use client";

import { Gauge, Search, TrendingUp, Wallet } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Benefit strip directly under the hero (landing brief §4 "hueco #1", refined
 * in ronda-2 §2). Replaces the earlier bare number counter — which read as
 * isolated and unconvincing — with four homogeneous BENEFIT cards: one Lucide
 * icon (single weight, teal accent), a Rubik-semibold benefit line, and a
 * muted one-line sub.
 *
 * HONESTY: benefit #1 deliberately carries NO hard "+40%" number — the brand
 * promises "no fake numbers" and disclaims "estimates, not guarantees", so a
 * guaranteed percentage would contradict it. Every line here is truthful.
 *
 * Grid: 4 across on desktop, 2×2 on tablet, 1 column on mobile — identical
 * sizes/alignment across all four. Single teal accent, 1px borders, radii 6–12px.
 */
const BENEFITS: {
  icon: typeof TrendingUp;
  titleKey: string;
  subKey: string;
}[] = [
  { icon: TrendingUp, titleKey: "socialStrip.b1Title", subKey: "socialStrip.b1Sub" },
  { icon: Gauge, titleKey: "socialStrip.b2Title", subKey: "socialStrip.b2Sub" },
  { icon: Search, titleKey: "socialStrip.b3Title", subKey: "socialStrip.b3Sub" },
  { icon: Wallet, titleKey: "socialStrip.b4Title", subKey: "socialStrip.b4Sub" },
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
