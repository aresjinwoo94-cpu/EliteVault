"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * In-app cancel / resume for an active paid subscription — hits
 * /api/stripe/cancel so the user never has to leave EliteVault (the Stripe
 * Portal is still available separately for invoices / payment method).
 *
 * Cancel uses a lightweight inline two-step confirm (no dialog dependency):
 * first click arms it, second click within the same view confirms.
 */
export function SubscriptionActions({
  cancelAtPeriodEnd,
  periodEndLabel,
}: {
  cancelAtPeriodEnd: boolean;
  periodEndLabel: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function call(action: "cancel" | "resume") {
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const j = (await res.json()) as { error?: string; detail?: string };
        if (!res.ok) throw new Error(j.detail ?? j.error ?? "Request failed");
        toast.success(
          action === "cancel"
            ? periodEndLabel
              ? `Subscription will end on ${periodEndLabel}.`
              : "Subscription set to cancel at period end."
            : "Subscription resumed — you're all set.",
        );
        setConfirming(false);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  // Already scheduled to cancel → offer resume.
  if (cancelAtPeriodEnd) {
    return (
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => call("resume")}
      >
        {isPending ? "Resuming…" : "Resume subscription"}
      </Button>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Keep plan
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() => call("cancel")}
          className="border-destructive/40 text-destructive hover:bg-destructive/[0.06]"
        >
          {isPending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      className="text-white/55 hover:text-white"
      onClick={() => setConfirming(true)}
    >
      Cancel subscription
    </Button>
  );
}
