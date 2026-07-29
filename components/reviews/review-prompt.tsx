"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, X, ArrowRight } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";

const DISMISS_KEY = "ev_review_prompt_dismissed";

/**
 * Subtle, dismissible "How was your audit? Leave a review" nudge shown at the
 * natural satisfaction moment (right after an audit succeeds). Non-intrusive:
 * one hairline card, a single teal CTA, and a dismiss that persists in
 * localStorage so it never nags. Renders nothing once dismissed.
 */
export function ReviewPrompt() {
  const { t } = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-4 py-3 motion-safe:animate-fade-up">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
        <Star className="size-4 fill-signal-400 text-signal-400" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-white/70">{t("reviews.promptText")}</p>
      <Link
        href="/app/review"
        className="glow-secondary inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-signal-500/30 bg-signal-600/10 px-3 py-1.5 text-xs font-medium text-signal-200 hover:text-signal-100"
      >
        {t("reviews.promptCta")}
        <ArrowRight className="size-3.5" />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("reviews.promptDismiss")}
        className="rounded-md p-1 text-white/30 transition-colors hover:text-white/60"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
