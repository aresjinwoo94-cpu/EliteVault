"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
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
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(initialPlan);
  const [pollAttempts, setPollAttempts] = useState(0);
  const isUpgraded = currentPlan === expectedPlan;
  const exhausted = pollAttempts >= 8 && !isUpgraded;

  useEffect(() => {
    if (isUpgraded || exhausted) return;
    const t = setTimeout(async () => {
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
    return () => clearTimeout(t);
  }, [pollAttempts, isUpgraded, exhausted]);

  const planMeta = PLANS[expectedPlan];
  const credits = planMeta.monthlyCredits;

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
            Payment successful
          </Badge>
          <h1 className="mt-4 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
            Welcome to{" "}
            <span className="italic text-gold-gradient">{planMeta.name}</span>.
          </h1>
          <p className="mt-3 text-sm md:text-base text-white/60 leading-relaxed">
            Your subscription is active.{" "}
            <span className="text-white">{credits} credits</span> just landed
            in your account. Time to put them to work.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link href="/app/analyzer">
            <Button size="lg" className="w-full sm:w-auto">
              Run your first analysis
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link href="/app/billing">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              View billing
            </Button>
          </Link>
        </div>

        <p className="text-[11px] text-white/35 pt-4">
          A receipt is on its way to your email. Manage your subscription
          anytime from{" "}
          <Link
            href="/app/billing"
            className="text-champagne-400 hover:text-champagne-300"
          >
            billing
          </Link>
          .
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
            Activating your plan…
          </h1>
          <p className="mt-3 text-sm text-white/55 leading-relaxed">
            Stripe just confirmed the payment. We&apos;re finalizing your
            account — should be a couple of seconds.
          </p>
        </div>
        <p className="text-[11px] text-white/30">
          Attempt {pollAttempts + 1} / 8…
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
          Payment received — finalizing
        </h1>
        <p className="mt-3 text-sm text-white/55 leading-relaxed">
          Your card was charged successfully. Our system is taking a moment
          to reflect the new plan. It will update within a minute — refresh
          billing or your dashboard to see {planMeta.name} active.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          size="lg"
          onClick={() => router.refresh()}
          className="w-full sm:w-auto"
        >
          Refresh now
        </Button>
        <Link href="/app/billing">
          <Button variant="outline" size="lg" className="w-full sm:w-auto">
            Go to billing
          </Button>
        </Link>
      </div>
    </div>
  );
}
