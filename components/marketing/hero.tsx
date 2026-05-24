"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 md:pt-44 md:pb-32 overflow-hidden">
      {/* radial backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-0 -translate-x-1/2 size-[1200px] rounded-full opacity-[0.6]"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.18) 0%, rgba(124,58,237,0.08) 35%, transparent 70%)",
          }}
        />
      </div>

      <div className="container max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <Badge variant="gold" className="mx-auto">
            <Sparkles className="size-3" />
            Powered by Claude — built for ecommerce founders
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.05 }}
          className="mt-6 font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.02] tracking-tight"
        >
          <span className="block">Copy what's</span>
          <span className="block text-gold-gradient italic">actually</span>
          <span className="block">converting.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.15 }}
          className="mx-auto mt-7 max-w-2xl text-lg md:text-xl text-white/55 leading-relaxed"
        >
          EliteVault hunts down stores that are <span className="text-white/85">already selling</span>,
          breaks down exactly why they convert, and gives your store the same
          brutal audit a senior media buyer would — annotated screenshots,
          buyer-persona simulations and Auto-Rewrite included.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.25 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link href="/sign-up">
            <Button size="xl">
              Audit your store free
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="#analyzer">
            <Button variant="outline" size="xl">
              See it in action
            </Button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.6 }}
          className="mt-6 text-xs tracking-wide text-white/30"
        >
          No credit card. 1 free analysis. Cancel anytime.
        </motion.p>
      </div>

      {/* hero preview card */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, ease, delay: 0.4 }}
        className="container mt-20"
      >
        <HeroPreview />
      </motion.div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-champagne-400/30 via-transparent to-violet-600/20 blur-xl" />
      <div className="relative glass-strong rounded-3xl p-2 shadow-2xl">
        <div className="rounded-2xl overflow-hidden bg-obsidian-950 border border-white/5">
          {/* fake browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-obsidian-900/60">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
            </div>
            <div className="ml-3 flex-1 rounded-md bg-white/[0.04] px-3 py-1 text-xs text-white/40 font-mono">
              elitevault.app/app/analyzer
            </div>
          </div>
          <div className="grid md:grid-cols-[1fr_320px] gap-0">
            {/* left: simulated annotated screenshot */}
            <div className="relative aspect-[16/10] bg-gradient-to-br from-obsidian-800 to-obsidian-900 overflow-hidden">
              <div className="absolute inset-0 bg-dot-grid opacity-50" />
              {/* fake annotations */}
              <div className="absolute left-[12%] top-[18%] size-24 rounded-full border-2 border-destructive/80 animate-pulse" />
              <div className="absolute left-[12%] top-[44%] text-xs text-destructive font-medium bg-destructive/10 backdrop-blur px-2 py-1 rounded">
                Hero CTA below the fold
              </div>
              <div className="absolute right-[18%] top-[55%] size-20 rounded-full border-2 border-warning/70" />
              <div className="absolute left-[40%] bottom-[15%] flex items-center gap-2 text-xs text-success bg-success/10 backdrop-blur px-2 py-1 rounded">
                ✓ Strong product imagery
              </div>
              {/* mock chrome */}
              <div className="absolute inset-x-8 top-8 h-16 rounded-xl bg-white/5 border border-white/10" />
              <div className="absolute left-8 bottom-12 right-8 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-xl bg-white/[0.03] border border-white/5"
                  />
                ))}
              </div>
            </div>
            {/* right: live audit panel */}
            <div className="border-l border-white/5 bg-obsidian-900/40 p-5 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40">
                  Overall score
                </p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-serif text-5xl tnum text-gold-gradient">
                    62
                  </span>
                  <span className="text-white/40 text-sm">/ 100</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {[
                  ["Organic", 4.2, "champagne"],
                  ["Meta ads — bad", 0.6, "destructive"],
                  ["Meta ads — regular", 1.4, "warning"],
                  ["Meta ads — good", 3.1, "success"],
                ].map(([label, val, tone]) => (
                  <div key={label as string}>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/50">{label as string}</span>
                      <span className="tnum text-white/80">{val}%</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={
                          tone === "champagne"
                            ? "h-full bg-champagne-400"
                            : tone === "success"
                              ? "h-full bg-success"
                              : tone === "warning"
                                ? "h-full bg-warning"
                                : "h-full bg-destructive"
                        }
                        style={{ width: `${Number(val) * 18}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 text-[11px] text-white/60 leading-relaxed">
                "<span className="italic">I'd bounce — the offer isn't
                obvious in the first 2 seconds.</span>"
                <br />
                <span className="text-white/30">— buyer persona, F 28-34 US</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
