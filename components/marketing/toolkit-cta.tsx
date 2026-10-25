"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The section's ONE call to action: scroll up to the hero's URL box and put the
 * caret in it. The hero input carries `data-audit-source="hero"`
 * (components/marketing/anon-audit-box.tsx). If it is not on the page for any
 * reason, fall back to the top of the page.
 */
export function ToolkitCta({ label }: { label: string }) {
  return (
    <Button
      size="xl"
      onClick={() => {
        const input = document.querySelector<HTMLInputElement>('[data-audit-source="hero"]');
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
        if (!input) {
          window.scrollTo({ top: 0, behavior });
          return;
        }
        input.scrollIntoView({ behavior, block: "center" });
        // preventScroll: the smooth scroll above owns the movement.
        input.focus({ preventScroll: true });
      }}
    >
      {label}
      <ArrowRight className="size-4" aria-hidden />
    </Button>
  );
}
