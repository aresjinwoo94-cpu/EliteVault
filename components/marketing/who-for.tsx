"use client";

import { useT } from "@/components/i18n/locale-provider";

/**
 * "Who EliteVault is for" — the buyer-persona self-identification band (SEO
 * Tarea 2 §5.2). It names the design-led niches explicitly so a visitor in one
 * of them thinks "that's me", and so the page picks up long-tail niche queries
 * (accessories / jewelry / home decor store audit, etc.) without a dedicated
 * page each. Purely additive marketing copy — no logic, no product surface.
 */
export function WhoFor() {
  const { t } = useT();
  const niches = t("whoFor.niches")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  return (
    <section aria-label={t("whoFor.eyebrow")} className="relative">
      <div className="container max-w-[1280px]">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.06] bg-white/[0.015] p-8 md:p-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
            {t("whoFor.eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-2xl md:text-3xl tracking-tight text-balance">
            {t("whoFor.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed">{t("whoFor.body")}</p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {niches.map((n) => (
              <li
                key={n}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-xs text-white/70"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
