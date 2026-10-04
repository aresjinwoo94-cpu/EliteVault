"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import posthog from "posthog-js";
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, type PlanTier } from "@/lib/stripe/plans";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Belt-and-suspenders client-side confirmation polling (v3.8.4).
 *
 * Even after the server-side eager sync in the return page, there's a tiny
 * window where the profile fetch could see stale data (e.g. read replica
 * lag, edge cache, retry on connection blip). To kill that last 1% of UX
 * pain, this client component polls /api/me up to 8 times at 1s intervals
 * until it sees the expected plan. As soon as it confirms the upgrade, it
 * shows the success card. If after 8s the plan still isn't reflected, it
 * shows a soft fallback that links to billing (the webhook is fine — just
 * slow this once).
 */
export function PlanConfirmation({
  expectedPlan,
  initialPlan,
}: {
  expectedPlan: PlanTier;
  initialPlan: PlanTier;
}) {
  const router = useRouter();
  const { t } = useT();
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(initialPlan);
  const [pollAttempts, setPollAttempts] = useState(0);
  const isUpgraded = currentPlan === expectedPlan;
  const exhausted = pollAttempts >= 8 && !isUpgraded;

  useEffect(() => {
    if (isUpgraded || exhausted) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { plan?: PlanTier };
          if (data.plan) setCurrentPlan(data.plan);
        }
      } catch {
        /* ignore — try again next tick */
      }
      setPollAttempts((p) => p + 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pollAttempts, isUpgraded, exhausted]);

  const planMeta = PLANS[expectedPlan];
  const credits = planMeta.monthlyCredits;

  // PostHog conversion event — fired exactly once, the first tick we
  // see the plan upgrade reflected. This is THE event you build the
  // signup→pro funnel on in the dashboard.
  useEffect(() => {
    if (!isUpgraded) return;
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(posthog as any).__loaded) return;
    posthog.capture("plan_upgraded", {
      plan: expectedPlan,
      credits,
      from_plan: initialPlan,
    });
  }, [isUpgraded, expectedPlan, credits, initialPlan]);

  // ─── Success ─────────────────────────────────────────────────────
  if (isUpgraded) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-md w-full text-center space-y-6"
      >
        <div className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-success/15 ring-2 ring-success/30">
          <CheckCircle2 className="size-10 text-success" />
          <div className="absolute -inset-2 rounded-full bg-success/20 blur-xl animate-pulse" />
        </div>

        <div>
          <Badge variant="gold" className="mx-auto">
            <Sparkles className="size-3" />
            {t("checkout.paymentSuccessful")}
          </Badge>
          <h1 className="mt-4 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
            {t("checkout.welcomePre")}{" "}
            <span className="text-gold-gradient">{planMeta.name}</span>.
          </h1>
          <p className="mt-3 text-sm md:text-base text-white/60 leading-relaxed">
            {t("checkout.subscriptionActive")}{" "}
            <span className="text-white">
              {credits} {t("checkout.creditsLanded")}
            </span>{" "}
            {t("checkout.creditsLandedPost")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link href="/app/analyzer">
            <Button size="lg" className="w-full sm:w-auto">
              {t("checkout.runFirst")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="/app/billing">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              {t("checkout.viewBilling")}
            </Button>
          </Link>
        </div>

        <p className="text-[11px] text-white/35 pt-4">
          {t("checkout.receiptPre")}{" "}
          <Link
            href="/app/billing"
            className="text-champagne-400 hover:text-champagne-300"
          >
            {t("checkout.receiptLink")}
          </Link>
          {t("checkout.receiptPost")}
        </p>
      </motion.div>
    );
  }

  // ─── Polling — show "almost done" so user knows we're working ────
  if (!exhausted) {
    return (
      <div className="max-w-md w-full text-center space-y-6">
        <div className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-champagne-400/10 ring-2 ring-champagne-400/25">
          <Loader2 className="size-9 text-champagne-400 animate-spin" />
        </div>
        <div>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight">
            {t("checkout.activating")}
          </h1>
          <p className="mt-3 text-sm text-white/55 leading-relaxed">
            {t("checkout.activatingBody")}
          </p>
        </div>
        <p className="text-[11px] text-white/30">
          {t("checkout.attempt").replace("{n}", String(pollAttempts + 1))}
        </p>
      </div>
    );
  }

  // ─── Exhausted — soft fallback (webhook will catch up) ───────────
  return (
    <div className="max-w-md w-full text-center space-y-6">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-warning/10 ring-1 ring-warning/30">
        <AlertTriangle className="size-7 text-warning" />
      </div>
      <div>
        <h1 className="font-serif text-3xl tracking-tight">
          {t("checkout.finalizing")}
        </h1>
        <p className="mt-3 text-sm text-white/55 leading-relaxed">
          {t("checkout.finalizingBody").replace("{plan}", planMeta.name)}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          size="lg"
          onClick={() => router.refresh()}
          className="w-full sm:w-auto"
        >
          {t("checkout.refreshNow")}
        </Button>
        <Link href="/app/billing">
          <Button variant="outline" size="lg" className="w-full sm:w-auto">
            {t("checkout.goToBilling")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
