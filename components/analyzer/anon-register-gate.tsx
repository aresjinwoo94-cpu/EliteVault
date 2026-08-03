"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { ArrowRight, Sparkles, UserPlus, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Anonymous → free-account activation gate, layered on the (identical) free
 * analyzer report shown to a cold visitor on /audit/[id].
 *
 * Two surfaces, both pushing the SAME primary action — create a free account —
 * for the reasons the visitor actually cares about: keep this report, run
 * another audit, and browse the winning-stores Library. The report's existing
 * inline locks + the AnalyzerPaywall modals already push Pro/Scale, so this one
 * stays focused on sign-up (the step that must come first).
 *
 *   • A persistent banner above the report (always visible, never blocks).
 *   • A one-time modal (per audit, sessionStorage) — close always available,
 *     no countdown, no fake scarcity.
 */

const SIGNUP_HREF = "/sign-up?next=/app/analyzer";

function capture(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture(event, props);
    }
  } catch {
    /* best-effort */
  }
}

export function AnonRegisterGate({ score }: { score: number | null }) {
  const { t } = useT();
  const roundedScore =
    score != null ? Math.round(score > 1 ? score : score * 100) : null;
  const [open, setOpen] = useState(false);
  const shown = useRef(false);

  // Raise the modal exactly ONCE per session, and only after a long read
  // window — this is a serious tool, not a nag. A single, quiet, dismissible
  // nudge ~45s in, never on arrival (that would bury the report they waited
  // for), never repeated. The persistent banner carries the ask the rest of
  // the time.
  useEffect(() => {
    if (shown.current) return;
    try {
      if (sessionStorage.getItem("ev_anon_register_gate") === "1") {
        shown.current = true;
        return;
      }
    } catch {
      /* storage blocked */
    }

    const timer = setTimeout(() => {
      if (shown.current) return;
      shown.current = true;
      setOpen(true);
      capture("anon_gate_shown", { trigger: "dwell", score: roundedScore });
      try {
        sessionStorage.setItem("ev_anon_register_gate", "1");
      } catch {
        /* ignore */
      }
    }, 45_000);
    return () => clearTimeout(timer);
  }, [roundedScore]);

  const onSignup = (trigger: string) =>
    capture("anon_gate_signup_click", { trigger, score: roundedScore });

  return (
    <>
      {/* Persistent banner */}
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-signal-400/25 bg-gradient-to-br from-signal-600/[0.08] to-champagne-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-signal-600/15 ring-1 ring-signal-500/25">
            <UserPlus className="size-4 text-signal-300" />
          </div>
          <p className="min-w-0 text-sm text-white/80 leading-relaxed">
            {t("anonGate.banner")}
          </p>
        </div>
        <Link href={SIGNUP_HREF} onClick={() => onSignup("banner")} className="shrink-0">
          <Button variant="primary" size="sm">
            <Sparkles className="size-4" />
            {t("anonGate.bannerCta")}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>

      {/* One-time modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("anonGate.title").replace("{score}", String(roundedScore ?? "—"))}
            </DialogTitle>
            <DialogDescription>{t("anonGate.modalBody")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2">
            <Link href={SIGNUP_HREF} onClick={() => onSignup("modal")}>
              <Button variant="primary" size="lg" className="w-full">
                <Sparkles className="size-4" />
                {t("anonGate.ctaPrimary")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="py-1 text-xs text-white/40 transition-colors hover:text-white/70"
            >
              {t("anonGate.ctaSecondary")}
            </button>
          </div>
          <p className="mt-1 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-white/45">
            {t("anonGate.proNote")}
          </p>
          <p className="inline-flex items-center justify-center gap-1 text-[10px] text-white/35">
            <Shield className="size-3" />
            {t("anonReveal.saved")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
