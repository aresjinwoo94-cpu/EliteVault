"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataPill } from "@/components/ui/data-pill";
import { PLANS, type Interval } from "@/lib/stripe/plans";
import { cn, formatCurrency } from "@/lib/utils";
import { useT } from "@/components/i18n/locale-provider";

export function Pricing() {
  const { t } = useT();
  // Show monthly pricing first — it's the lower sticker number and the
  // honest default. The toggle still switches to yearly (with the 20% save).
  const [interval, setInterval] = useState<Interval>("month");

  return (
    <section id="pricing" className="py-24 md:py-32 border-t border-white/[0.04]">
      <div className="container max-w-6xl">
        <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
          <DataPill items={["PRICING", "FREE DIAGNOSIS"]} />
          <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
            {t("pricing.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed text-lg">
            {t("pricing.subheading")}
          </p>
          {/* P2.5 — explicit value ladder so the jump between tiers reads at a glance. */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-white/45">
            <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1">
              Free → <span className="text-white/70">{t("pricing.ladderDiagnose")}</span>
            </span>
            <span className="text-white/25">›</span>
            <span className="rounded-full border border-champagne-400/25 bg-champagne-400/[0.05] px-3 py-1">
              Pro → <span className="text-champagne-200">{t("pricing.ladderCure")}</span>
            </span>
            <span className="text-white/25">›</span>
            <span className="rounded-full border border-signal-500/25 bg-signal-600/[0.05] px-3 py-1">
              Scale → <span className="text-signal-200">{t("pricing.ladderVolume")}</span>
            </span>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="inline-flex rounded-full border border-white/[0.08] p-1 bg-white/[0.02]">
            {(["month", "year"] as Interval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={cn(
                  "px-4 py-1.5 text-sm rounded-full transition-all",
                  interval === i
                    ? "bg-champagne-400 text-obsidian-900 font-medium"
                    : "text-white/60 hover:text-white",
                )}
              >
                {i === "month" ? t("pricing.monthly") : t("pricing.yearly")}
                {i === "year" && (
                  <span className="ml-1.5 text-[10px] text-success">{t("pricing.save20")}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {Object.values(PLANS).map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative rounded-2xl border bg-card shadow-card p-7 flex flex-col",
                plan.highlight
                  ? "border-champagne-400/30"
                  : "border-white/[0.06]",
              )}
            >
              {plan.badge && (
                <Badge
                  variant={plan.highlight ? "gold" : "default"}
                  className="absolute -top-2.5 left-7"
                >
                  {plan.badge}
                </Badge>
              )}

              <div>
                <h3 className="text-xl font-medium tracking-tight">{plan.name}</h3>
                <p className="mt-1 text-sm text-white/40">{plan.tagline}</p>
              </div>

              <div className="mt-6 flex items-baseline gap-1">
                <span className="font-mono tabular-nums text-5xl tracking-tight text-signal-300">
                  {plan.price[interval] === 0
                    ? t("pricing.priceFree")
                    : formatCurrency(plan.price[interval])}
                </span>
                {plan.price[interval] > 0 && (
                  <span className="font-mono text-sm text-white/40">
                    / {interval === "month" ? t("pricing.perMonth") : t("pricing.perYear")}
                  </span>
                )}
              </div>
              {interval === "year" && plan.price.year > 0 && (
                <p className="mt-1.5 text-xs text-success">
                  {formatCurrency(Math.round(plan.price.year / 12))}
                  {t("pricing.billedYearly")}{" "}
                  {formatCurrency(plan.price.month * 12 - plan.price.year)}/yr
                </p>
              )}

              <p className="mt-3 text-sm text-white/55 leading-relaxed min-h-[44px]">
                {plan.description}
              </p>

              <Link
                href={
                  plan.id === "free"
                    ? "/sign-up"
                    : `/sign-up?plan=${plan.id}&interval=${interval}`
                }
                className="mt-7"
              >
                <Button
                  variant={plan.highlight ? "primary" : "outline"}
                  size="lg"
                  className="w-full"
                >
                  {plan.id === "free"
                    ? t("pricing.ctaFree")
                    : `${t("pricing.ctaStart")} ${plan.name}`}
                </Button>
              </Link>

              <ul className="mt-7 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li
                    key={f.text}
                    className={cn(
                      "flex gap-2.5",
                      f.included ? "text-white/80" : "text-white/30",
                    )}
                  >
                    {f.included ? (
                      <Check
                        className={cn(
                          "size-4 shrink-0 mt-0.5",
                          f.highlight ? "text-champagne-400" : "text-success",
                        )}
                      />
                    ) : (
                      <X className="size-4 shrink-0 mt-0.5 text-white/20" />
                    )}
                    <span className={cn(f.highlight && "text-white font-medium")}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Stripe reassurance — payments are handled by Stripe; make that
            explicit right where the purchase decision happens. */}
        <div className="mt-10 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-1.5 text-xs text-white/45">
            <Lock className="size-3.5 text-champagne-400/80" />
            {t("pricing.stripeNote")}
          </span>
        </div>
      </div>
    </section>
  );
}
