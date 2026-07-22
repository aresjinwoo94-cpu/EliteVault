"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import type { Plan, Interval } from "@/lib/stripe/plans";

export function PlanCard({
  plan,
  current,
  hasExistingSub,
}: {
  plan: Plan;
  current: boolean;
  /** True if the user already has *any* paid subscription. */
  hasExistingSub: boolean;
}) {
  const router = useRouter();
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
  function checkout() {
    if (plan.id === "free") return;
    if (hasExistingSub) {
      // Existing sub → portal flow is unchanged
      startTransition(async () => {
        try {
          const res = await fetch("/api/stripe/portal", { method: "POST" });
          if (!res.ok) {
            const j = (await res.json()) as { error?: string; detail?: string };
            throw new Error(j.detail ?? j.error ?? "Portal failed");
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
          Current plan
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
          <div className="mt-3 inline-flex rounded-md border border-white/[0.08] p-0.5 bg-white/[0.02] text-[11px]">
            {(["month", "year"] as Interval[]).map((i) => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={cn(
                  "px-2 py-0.5 rounded-sm transition-all",
                  interval === i
                    ? "bg-champagne-400 text-obsidian-900 font-medium"
                    : "text-white/50 hover:text-white",
                )}
              >
                {i === "month" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-serif text-4xl">
              {formatCurrency(plan.price[interval])}
            </span>
            <span className="text-xs text-white/40">
              / {interval === "month" ? "mo" : "yr"}
            </span>
          </div>
          {interval === "year" && plan.price.year > 0 && (
            <p className="mt-1 text-[11px] text-success">
              {formatCurrency(Math.round(plan.price.year / 12))}/mo billed yearly
              {" · save "}
              {formatCurrency(plan.price.month * 12 - plan.price.year)}/yr
            </p>
          )}
        </>
      ) : (
        <div className="mt-3">
          <span className="font-serif text-4xl">Free</span>
        </div>
      )}

      <p className="mt-3 text-xs text-white/55 leading-relaxed min-h-[44px]">
        {plan.description}
      </p>

      <Button
        onClick={checkout}
        disabled={current || plan.id === "free" || isPending}
        variant={plan.highlight && !current ? "primary" : "outline"}
        className="mt-5 w-full"
      >
        {current
          ? "Active"
          : plan.id === "free"
            ? "Free forever"
            : isPending
              ? "Loading…"
              : hasExistingSub
                ? `Switch to ${plan.name} (via Portal)`
                : `Start ${plan.name}`}
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
