"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Scan, Library } from "lucide-react";
import { DataPill } from "@/components/ui/data-pill";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/locale-provider";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * "Two ways to win" — the bridge that makes the product legible on cold
 * traffic. EliteVault has two pillars (Analyzer + Library); this section
 * states them side-by-side as two explicit paths so a first-time visitor
 * instantly understands the whole product and picks the door that fits.
 *
 * Left  → Diagnose: audit your own store  (routes into sign-up → analyzer)
 * Right → Model:    study winning stores  (routes to the public library page)
 */
export function TwoPaths() {
  const { t } = useT();

  const cards = [
    {
      icon: Scan,
      label: t("twoPaths.analyzeLabel"),
      title: t("twoPaths.analyzeTitle"),
      body: t("twoPaths.analyzeBody"),
      cta: t("twoPaths.analyzeCta"),
      href: "/sign-up?next=/app/analyzer",
      primary: true,
    },
    {
      icon: Library,
      label: t("twoPaths.studyLabel"),
      title: t("twoPaths.studyTitle"),
      body: t("twoPaths.studyBody"),
      cta: t("twoPaths.studyCta"),
      href: "/winning-shopify-stores",
      primary: false,
    },
  ];

  return (
    <section className="py-24 md:py-32">
      <div className="container max-w-6xl">
        <div className="max-w-2xl">
          <DataPill items={[t("twoPaths.pill1"), t("twoPaths.pill2")]} />
          <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
            {t("twoPaths.heading")}
          </h2>
          <p className="mt-4 text-lg text-white/55 leading-relaxed">
            {t("twoPaths.subheading")}
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {cards.map((c, i) => {
            // The brand is mono-teal (champagne-*/gold-* are legacy keys that
            // resolve to the SAME teal as signal-*), so the two paths can't be
            // told apart by hue. Hierarchy instead: the primary path carries the
            // teal accent + filled CTA, the secondary stays neutral + outline.
            const isPrimary = c.primary;
            return (
              <motion.div
                key={c.href}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.55, delay: i * 0.08, ease }}
                className="group relative flex flex-col rounded-2xl border border-white/[0.06] bg-card p-7 shadow-card transition-colors hover:border-white/[0.12]"
              >
                <div
                  className={
                    "flex size-11 items-center justify-center rounded-xl ring-1 " +
                    (isPrimary
                      ? "bg-signal-600/10 ring-signal-500/20"
                      : "bg-white/[0.04] ring-white/10")
                  }
                >
                  <c.icon
                    className={
                      "size-5 " + (isPrimary ? "text-signal-300" : "text-white/70")
                    }
                  />
                </div>

                <p
                  className={
                    "mt-6 text-[11px] font-medium uppercase tracking-widest " +
                    (isPrimary ? "text-signal-300/80" : "text-white/40")
                  }
                >
                  {c.label}
                </p>
                <h3 className="mt-2 font-serif text-2xl tracking-tight text-white">
                  {c.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/55">
                  {c.body}
                </p>

                <div className="mt-6 pt-1">
                  <Button
                    asChild
                    variant={isPrimary ? "primary" : "outline"}
                    size="lg"
                  >
                    <Link href={c.href}>
                      {c.cta}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
