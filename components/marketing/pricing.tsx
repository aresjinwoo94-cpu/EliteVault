"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, type Interval } from "@/lib/stripe/plans";
import { cn, formatCurrency } from "@/lib/utils";

export function Pricing() {
  const [interval, setInterval] = useState<Interval>("month");

  return (
    <section id="pricing" className="py-24 md:py-32 border-t border-white/[0.04]">
      <div className="container max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight leading-tight">
            Simple pricing. Real leverage.
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed text-lg">
            Start free. Upgrade when the audit pays for the year in a single
            insight.
          </p>
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
                {i === "month" ? "Monthly" : "Yearly"}
                {i === "year" && (
                  <span className="ml-1.5 text-[10px] text-success">Save 20%</span>
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
                "relative rounded-2xl border bg-card/40 p-7 flex flex-col",
                plan.highlight
                  ? "border-champagne-400/30 shadow-gold"
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
                <span className="font-serif text-5xl tracking-tight">
                  {plan.price[interval] === 0
                    ? "Free"
                    : formatCurrency(plan.price[interval])}
                </span>
                {plan.price[interval] > 0 && (
                  <span className="text-sm text-white/40">
                    / {interval === "month" ? "mo" : "yr"}
                  </span>
                )}
              </div>

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
                  {plan.id === "free" ? "Get started" : `Start ${plan.name}`}
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
      </div>
    </section>
  );
}
