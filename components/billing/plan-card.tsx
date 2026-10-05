"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/i18n/format";
import { localizePlan } from "@/lib/i18n/plan-text";
import { toast } from "sonner";
import { useT } from "@/components/i18n/locale-provider";
import { preloadStripe } from "@/lib/stripe/client";
import type { Plan, Interval } from "@/lib/stripe/plans";

export function PlanCard({
  plan: basePlan,
  current,
  hasExistingSub,
}: {
  plan: Plan;
  current: boolean;
  /** True if the user already has *any* paid subscription. */
  hasExistingSub: boolean;
}) {
  const router = useRouter();
  const { t, locale } = useT();
  const plan = localizePlan(basePlan, t);
  // Default to MONTHLY — the lower entry price ($19/$29) converts far better
  // than leading with the annual upfront charge. The toggle still lets users
  // switch to yearly (and see the savings) before checkout.
  const [interval, setInterval] = useState<Interval>("month");
  const [isPending, startTransition] = useTransition();

  /**
   * If the user already has an active subscription, we route them to the
   * Stripe Customer Portal which does a *real* plan swap (proration handled
   * by Stripe). Otherwise we open our own Embedded Checkout page at
   * /app/checkout?plan=...&interval=... which loads the Stripe iframe
   * inside our dark-themed wrapper.
   *
   * This avoids the "dual subscription" footgun where Checkout creates a
   * parallel sub instead of upgrading.
   */
  /**
   * Warm everything the checkout needs before the click: the route (RSC +
   * chunks) and Stripe.js. No Checkout Session is created here.
   */
  function warmCheckout() {
    if (plan.id === "free" || hasExistingSub) return;
    router.prefetch(`/app/checkout?plan=${plan.id}&interval=${interval}`);
    preloadStripe();
  }

  function checkout() {
    if (plan.id === "free") return;
    if (hasExistingSub) {
      // Existing sub → portal flow is unchanged
      startTransition(async () => {
        try {
          const res = await fetch("/api/stripe/portal", { method: "POST" });
          if (!res.ok) {
            // .catch → an empty/non-JSON error body must not surface as
            // "Unexpected end of JSON input" on top of the real failure.
            const j = (await res.json().catch(() => ({}))) as {
              error?: string;
              detail?: string;
            };
            throw new Error(j.detail ?? j.error ?? t("billing.portalFailed"));
          }
          const { url } = (await res.json()) as { url: string };
          window.location.href = url;
        } catch (err) {
          toast.error((err as Error).message);
        }
      });
      return;
    }
    // Fresh signup → our embedded checkout page (handles its own loading state)
    router.push(`/app/checkout?plan=${plan.id}&interval=${interval}`);
  }

  return (
    <div
      className={cn(
        "relative rounded-2xl border p-6 flex flex-col",
        current
          ? "border-champagne-400/40 bg-champagne-400/[0.04] shadow-gold"
          : plan.highlight
            ? "border-champagne-400/20 bg-card/40"
            : "border-white/[0.06] bg-card/40",
      )}
    >
      {current && (
        <Badge variant="gold" className="absolute -top-2.5 left-6">
          {t("billing.currentBadge")}
        </Badge>
      )}
      {!current && plan.badge && (
        <Badge
          variant={plan.highlight ? "gold" : "default"}
          className="absolute -top-2.5 left-6"
        >
          {plan.badge}
        </Badge>
      )}

      <h3 className="text-lg font-medium tracking-tight">{plan.name}</h3>

      {plan.id !== "free" ? (
        <>
          <div className="mt-3 inline-flex rounded-md border border-white/[0.08] p-0.5 bg-white/[0.02] text-xs">
            {(["month", "year"] as Interval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={cn(
                  "px-3 py-2 min-h-11 inline-flex items-center rounded-sm transition-all",
                  interval === i
                    ? "bg-champagne-400 text-obsidian-900 font-medium"
                    : "text-white/50 hover:text-white",
                )}
              >
                {i === "month" ? t("billing.monthly") : t("billing.yearly")}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-serif text-4xl">
              {formatPrice(plan.price[interval], locale)}
            </span>
            <span className="text-xs text-white/40">
              / {interval === "month" ? t("billing.perMo") : t("billing.perYr")}
            </span>
          </div>
          {interval === "year" && plan.price.year > 0 && (
            <p className="mt-1 text-[11px] text-success">
              {t("billing.billedYearly")
                .replace(
                  "{monthly}",
                  formatPrice(Math.round(plan.price.year / 12), locale),
                )
                .replace(
                  "{save}",
                  formatPrice(plan.price.month * 12 - plan.price.year, locale),
                )}
            </p>
          )}
          {/* USD is the reference price; Stripe Adaptive Pricing charges the
              buyer in their local currency at checkout. */}
          <p className="mt-1 text-[11px] text-white/40">
            {t("pricing.localCurrencyNote")}
          </p>
        </>
      ) : (
        <div className="mt-3">
          <span className="font-serif text-4xl">{t("billing.free")}</span>
        </div>
      )}

      <p className="mt-3 text-xs text-white/55 leading-relaxed min-h-[44px]">
        {plan.description}
      </p>

      <Button
        onClick={checkout}
        onPointerEnter={warmCheckout}
        onFocus={warmCheckout}
        onTouchStart={warmCheckout}
        disabled={current || plan.id === "free" || isPending}
        variant={plan.highlight && !current ? "primary" : "outline"}
        className="mt-5 w-full"
      >
        {current
          ? t("billing.active")
          : plan.id === "free"
            ? t("billing.freeForever")
            : isPending
              ? t("billing.loading")
              : hasExistingSub
                ? t("billing.switchTo").replace("{plan}", plan.name)
                : t("billing.start").replace("{plan}", plan.name)}
      </Button>

      <ul className="mt-5 space-y-2 text-xs">
        {plan.features.slice(0, 6).map((f) => (
          <li
            key={f.text}
            className={cn(
              "flex gap-2",
              f.included ? "text-white/80" : "text-white/30",
            )}
          >
            {f.included ? (
              <Check className="size-3.5 shrink-0 mt-0.5 text-success" />
            ) : (
              <X className="size-3.5 shrink-0 mt-0.5 text-white/20" />
            )}
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
