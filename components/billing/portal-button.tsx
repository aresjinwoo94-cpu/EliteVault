"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useT } from "@/components/i18n/locale-provider";

export function PortalButton({
  children,
  variant = "outline",
}: {
  children: React.ReactNode;
  variant?: "primary" | "outline" | "secondary";
}) {
  const [isPending, startTransition] = useTransition();
  const { t } = useT();
  function open() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/portal", { method: "POST" });
        if (!res.ok) {
          // /api/stripe/portal puts the actionable sentence in `detail`
          // ("The Stripe Customer Portal isn't set up yet…"); `error` is only
          // a machine code. Prefer detail so the toast tells the user what to
          // do — matches how plan-card.tsx reads the same endpoint.
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
  }
  return (
    <Button onClick={open} variant={variant} disabled={isPending}>
      {isPending ? t("billing.opening") : children}
    </Button>
  );
}
