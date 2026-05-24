"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PortalButton({
  children,
  variant = "outline",
}: {
  children: React.ReactNode;
  variant?: "primary" | "outline" | "secondary";
}) {
  const [isPending, startTransition] = useTransition();
  function open() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/portal", { method: "POST" });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          throw new Error(j.error ?? "Portal failed");
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
      {isPending ? "Opening…" : children}
    </Button>
  );
}
