"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { ArrowRight, Shield, Sparkles, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { roasRangeForAudit } from "@/lib/meta/roas-range";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Analyzer upgrade paywall — the THIN modal layer (Tarea 3).
 *
 * The free report already pushes to Pro with elegant inline locks
 * (free-locked-cure, free-meta-panel). This adds AT MOST two modals at moments
 * of high intent, reusing the same $19/mo · "Cancel anytime · prorated"
 * language — it never duplicates or replaces the inline locks:
 *
 *   • Modal A (scroll recap) — fires ONCE when the user scrolls past the
 *     "What this means for your ads" block (they read the whole report). The
 *     peak-motivation moment, never on open.
 *   • Modal C (exit-intent, desktop) — fires at most ONCE when the cursor
 *     leaves toward the browser chrome.
 *
 * On-brand "no dark patterns": close (X) always available, "Maybe later"
 * everywhere, no countdowns / no fake scarcity. The only pressure is the store's
 * OWN honest numbers (its modeled loss, its locked fixes). Each modal shows once
 * per audit (sessionStorage), and never both at the same time.
 *
 * Rendered ONLY for free viewers on a succeeded audit (the caller gates that),
 * so nothing here ever nags a paying user.
 */

const CHECKOUT_PRO = "/app/checkout?plan=pro&interval=month";
const CHECKOUT_SCALE = "/app/checkout?plan=scale&interval=month";

function capture(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture(event, props);
    }
  } catch {
    /* best-effort */
  }
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function AnalyzerPaywall({
  analysisId,
  score,
  lockedFixes,
  niche,
  isAnon = false,
}: {
  analysisId: string;
  /** Overall audit score (0..100). */
  score: number;
  /** How many ranked fixes are still locked for a free viewer. */
  lockedFixes: number;
  /** Inferred niche — drives the honest ROAS band, same as the inline panel. */
  niche: string;
  /**
   * Anonymous mode. The anon reveal has its own "create a free account" modal
   * that fires at scroll-end, so we drop the Pro scroll-recap modal here (they'd
   * collide at the bottom) and keep only the exit-intent Pro nudge.
   */
  isAnon?: boolean;
}) {
  const { t } = useT();
  const roundedScore = Math.round(score > 1 ? score : score * 100);
  const range = roasRangeForAudit(roundedScore, niche);

  // `open` is the currently visible modal, or null. Only one at a time.
  const [open, setOpen] = useState<null | "scroll_recap" | "exit_intent">(null);
  // Guard so each trigger only ever fires once per audit, even before the
  // sessionStorage write lands. `openRef` lets the DOM listeners read the live
  // "is a modal already open" state without re-binding on every render.
  const firedRef = useRef<Record<string, boolean>>({});
  const openRef = useRef<typeof open>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Shared trigger — a plain function (the repo's React Compiler memoizes it;
  // manual useCallback here conflicts with that). Never stacks modals, never
  // repeats one within the audit/session.
  function trigger(name: "scroll_recap" | "exit_intent") {
    if (openRef.current || firedRef.current[name]) return;
    const storageKey = `ev_paywall_${name}_${analysisId}`;
    try {
      if (sessionStorage.getItem(storageKey) === "1") {
        firedRef.current[name] = true;
        return;
      }
    } catch {
      /* storage blocked — the in-memory ref still guards repeats */
    }
    firedRef.current[name] = true;
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    openRef.current = name;
    setOpen(name);
    capture("paywall_modal_shown", { trigger: name, analysis_id: analysisId, score: roundedScore });
  }

  // Modal A — scroll past the "What this means for your ads" block. The sentinel
  // sits right after that block, so seeing it means the user read the report.
  // Skipped in anonymous mode (the register modal owns the scroll-end moment).
  useEffect(() => {
    if (isAnon) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trigger("scroll_recap");
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // trigger reads only refs + stable props; safe to run this setup once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  // Modal C — desktop exit-intent (cursor leaves toward the browser chrome).
  // Touch devices don't fire mouseleave, so this is naturally desktop-only.
  useEffect(() => {
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger("exit_intent");
    };
    document.addEventListener("mouseleave", onLeave);
    return () => document.removeEventListener("mouseleave", onLeave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  function onDismiss(name: string) {
    capture("paywall_dismissed", { trigger: name, analysis_id: analysisId });
    openRef.current = null;
    setOpen(null);
  }

  function onCta(plan: "pro" | "scale", name: string) {
    capture("paywall_cta_click", { plan, trigger: name, analysis_id: analysisId });
  }

  const vars = {
    score: roundedScore,
    lockedFixes,
    roasLow: range.low.toFixed(1),
    roasHigh: range.high.toFixed(1),
  };

  return (
    <>
      {/* Scroll sentinel — placed after the ads block by the caller's layout. */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* Modal A — scroll recap */}
      <Dialog
        open={open === "scroll_recap"}
        onOpenChange={(o) => !o && onDismiss("scroll_recap")}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-balance leading-snug">
              {fill(range.ready ? t("paywall.aTitleReady") : t("paywall.aTitleLoss"), vars)}
            </DialogTitle>
            <DialogDescription className="text-white/60 leading-relaxed">
              {fill(t("paywall.aBody"), vars)}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2">
            <Link href={CHECKOUT_PRO} onClick={() => onCta("pro", "scroll_recap")}>
              <Button variant="primary" size="lg" className="w-full">
                <Sparkles className="size-4" />
                {t("paywall.aCtaPro")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href={CHECKOUT_SCALE} onClick={() => onCta("scale", "scroll_recap")}>
              <Button variant="outline" size="lg" className="w-full">
                <Crown className="size-4" />
                {t("paywall.aCtaScale")}
              </Button>
            </Link>
            <button
              onClick={() => onDismiss("scroll_recap")}
              className="py-1 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              {t("paywall.dismiss")}
            </button>
          </div>
          <p className="inline-flex items-center justify-center gap-1 text-[10px] text-white/35">
            <Shield className="size-3" />
            {t("paywall.micro")}
          </p>
        </DialogContent>
      </Dialog>

      {/* Modal C — exit-intent */}
      <Dialog
        open={open === "exit_intent"}
        onOpenChange={(o) => !o && onDismiss("exit_intent")}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-balance leading-snug">
              {fill(t("paywall.cTitle"), vars)}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2">
            <Link href={CHECKOUT_PRO} onClick={() => onCta("pro", "exit_intent")}>
              <Button variant="primary" size="lg" className="w-full">
                <Sparkles className="size-4" />
                {t("paywall.cCtaPro")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <button
              onClick={() => onDismiss("exit_intent")}
              className="py-1 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              {t("paywall.dismiss")}
            </button>
          </div>
          <p className="inline-flex items-center justify-center gap-1 text-[10px] text-white/35">
            <Shield className="size-3" />
            {t("paywall.micro")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
