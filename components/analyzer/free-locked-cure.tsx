"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Lock,
  Sparkles,
  ArrowRight,
  Shield,
  Crown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Free→Pro "cure" gate (P0.2 — "give the diagnosis, charge for the cure").
 *
 * A Free user gets the full diagnosis for free: overall score + annotated
 * screenshot (the "aha"). The CURE — the prioritized fix list and the
 * buyer-persona simulation — is rendered here BLURRED, with a Pro upgrade
 * CTA at the peak of desire.
 *
 * We deliberately blur the user's OWN real content (not a generic teaser):
 * they can see the SHAPE of their fixes and how many there are, just not
 * read them. Seeing your own locked answers converts far better than a
 * generic "Pro has fixes" pitch. This mirrors the Scale lock
 * (scale-locked-preview.tsx) so the two upsell surfaces feel consistent.
 *
 * The underlying data is already computed and stored on the analysis row
 * (the pipeline always runs the full agent) — so upgrading reveals the
 * existing result instantly, with zero re-spend on the AI.
 */
export function FreeLockedCure({
  title,
  tagline,
  count,
  children,
}: {
  title: string;
  tagline: string;
  /** Optional count badge, e.g. "5 fixes" — adds concreteness to the lock. */
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden p-6 md:p-7 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.04] to-violet-600/[0.04]">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 size-56 rounded-full bg-violet-600/12 blur-3xl" />

        <div className="relative">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Lock className="size-4 text-champagne-400" />
                <h3 className="font-medium text-white">{title}</h3>
                <Badge variant="gold" className="shrink-0">
                  <Crown className="size-3" />
                  Pro
                </Badge>
                {count && (
                  <Badge variant="default" className="shrink-0">
                    {count}
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 text-sm text-white/55 leading-relaxed max-w-2xl">
                {tagline}
              </p>
            </div>
          </div>

          {/* Blurred real content + centered upgrade CTA */}
          <div className="relative">
            <div
              aria-hidden
              className="filter blur-[6px] opacity-60 select-none pointer-events-none max-h-[420px] overflow-hidden"
            >
              {children}
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative flex flex-col items-center text-center max-w-sm px-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-champagne-400/15 ring-2 ring-champagne-400/30 backdrop-blur-sm">
                  <Lock className="size-5 text-champagne-300" />
                </div>
                <p className="mt-4 text-base font-medium text-white">
                  Unlock your fixes with Pro
                </p>
                <p className="mt-1 text-xs text-white/55 leading-relaxed">
                  Your diagnosis is free. Pro reveals the prioritized cure for
                  this audit — instantly, no re-analysis — plus unlimited
                  audits.
                </p>
                <Link
                  href="/app/checkout?plan=pro&interval=month"
                  className="mt-4"
                >
                  <Button variant="primary" size="lg">
                    <Sparkles className="size-4" />
                    Unlock for $19 / mo
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
                <p className="mt-2 text-[10px] text-white/35 inline-flex items-center gap-1">
                  <Shield className="size-3" />
                  Cancel anytime · prorated
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
