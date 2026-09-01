"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n/locale-provider";
import { createAnonAnalysis } from "@/app/actions/anon-analyzer";
import { cn } from "@/lib/utils";

/**
 * Inline anonymous-audit box — the activation funnel's front door.
 *
 * Extracted verbatim from the homepage hero so every public entry point can run
 * a REAL audit with no account instead of bouncing cold search traffic to
 * /sign-up. The SEO landings (/free-website-audit, /meta-ads-forecast,
 * /ai-buyer-persona-simulator, /convertmate-alternative,
 * /winning-shopify-stores/[niche]) all promise "free, no card" in their copy;
 * before this component they linked straight to /sign-up and broke that promise
 * on exactly the queries they were built to rank for.
 *
 * There is nothing new in the flow itself: it calls the same
 * `createAnonAnalysis()` server action, which runs the same Inngest pipeline,
 * and routes to the same /audit/[id] reveal. The per-IP daily limit therefore
 * applies across all of these pages for free — it is enforced server-side in
 * `checkAnonAuditRate()`, not per page.
 */

/**
 * Horizontal alignment of the input row and the caption beneath it.
 *
 * `center-then-left` is the homepage hero's own behaviour — centered while the
 * hero is stacked on mobile/tablet, left-aligned once the asymmetric two-column
 * split takes over at `lg`. The SEO landings use the two simple modes: `left`
 * in their left-aligned hero blocks, `center` inside their centered final-CTA
 * cards.
 */
type Align = "left" | "center" | "center-then-left";

const ROW_ALIGN: Record<Align, string> = {
  left: "sm:justify-start",
  center: "sm:justify-center",
  "center-then-left": "sm:justify-center lg:justify-start",
};

const CAPTION_ALIGN: Record<Align, string> = {
  left: "justify-start",
  center: "justify-center",
  "center-then-left": "justify-center lg:justify-start",
};

export type AnonAuditBoxProps = {
  /**
   * Attribution for the `anon_audit_started` PostHog event, so we can tell
   * which landing actually converts cold traffic into a first audit.
   */
  source: string;
  /** Overrides the default "Audit my store — free" button label. */
  ctaLabel?: string;
  align?: Align;
  /**
   * Caption under the box. Defaults to the shared "no login · no card" micro
   * line; pass a page's own caption to keep its wording, or `null` for none.
   */
  caption?: string | null;
  /**
   * Overrides the caption's typography. The SEO landings pass their original
   * mono/uppercase treatment so swapping the CTA for this box doesn't quietly
   * restyle their hero captions.
   */
  captionClassName?: string;
  /** Optional quiet link beside the caption (e.g. the /sign-up fallback). */
  secondary?: { href: string; label: string } | null;
  className?: string;
};

export function AnonAuditBox({
  source,
  ctaLabel,
  align = "left",
  caption,
  captionClassName,
  secondary,
  className,
}: AnonAuditBoxProps) {
  const { t } = useT();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const value = url.trim();
    if (!value) {
      toast.error(t("hero.inputPlaceholder"));
      return;
    }
    startTransition(async () => {
      // Activation event — the first step of the anon funnel.
      try {
        if (
          typeof window !== "undefined" &&
          (posthog as { __loaded?: boolean }).__loaded
        ) {
          posthog.capture("anon_audit_started", { url: value, source });
        }
      } catch {
        /* analytics best-effort */
      }
      const res = await createAnonAnalysis({ url: value });
      if (!res.ok) {
        // Already signed in → send them to their OWN analyzer, carrying the
        // URL so they don't retype it. Restores the routing the /sign-up CTA
        // used to get from the middleware.
        if (res.signedIn) {
          router.push(`/app/analyzer?url=${encodeURIComponent(value)}`);
          return;
        }
        // Over the daily limit → nudge to a free account, don't just error.
        if (res.limited) {
          toast(res.error, {
            action: {
              label: t("anonGate.ctaPrimary"),
              onClick: () => router.push("/sign-up?next=/app/analyzer"),
            },
          });
        } else {
          toast.error(res.error);
        }
        return;
      }
      router.push(`/audit/${res.id}`);
    });
  }

  const captionText = caption === undefined ? t("hero.anonMicro") : caption;

  return (
    <div className={className}>
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center",
          ROW_ALIGN[align],
        )}
      >
        <div className="relative w-full sm:max-w-md">
          <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("hero.inputPlaceholder")}
            aria-label={t("hero.inputPlaceholder")}
            disabled={isPending}
            // `text-left` is load-bearing: the final-CTA cards these boxes sit
            // in are `text-center`, and text-align inherits into <input>, so
            // without it the typed URL centres away from the Globe icon.
            className="h-12 pl-10 text-base text-left"
          />
        </div>
        <Button size="xl" className="shrink-0" onClick={submit} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("hero.auditing")}
            </>
          ) : (
            <>
              {ctaLabel ?? t("hero.auditButton")}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      {(captionText || secondary) && (
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5",
            CAPTION_ALIGN[align],
          )}
        >
          {captionText && (
            <p
              className={cn(
                "text-xs tracking-wide text-white/35",
                captionClassName,
              )}
            >
              {captionText}
            </p>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              className="group -my-2 py-2 inline-flex items-center gap-1.5 text-xs text-white/45 transition-colors hover:text-white/80"
            >
              {secondary.label}
              <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
