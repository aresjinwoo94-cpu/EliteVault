"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { phCapture } from "@/lib/analytics/posthog";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";

/**
 * The one-time "unlock this report" offer INSIDE the report (WP-4, brief oct-2026 §6) — behind REPORT_UNLOCK.
 *
 * Two pieces, and nothing automatic:
 *   • an inline CARD next to the locked fixes (always visible, never a pop-up);
 *   • a MODAL that opens ONLY when the user clicks something locked (a fix, the persona, a fix track, the
 *     simulator, an annotation). It never opens by itself, on scroll or on exit intent.
 *
 * A provider holds the state so every locked surface calls the same `open(source)`. Without a provider (flag
 * off, paid viewers) `useUnlockOffer()` returns `enabled: false` and every consumer renders exactly what it
 * rendered before — the report is byte-identical.
 *
 * Anonymous visitors: the CTA goes to sign-up first (`next=/app/unlock/<id>`; the anonymous audit is claimed
 * on sign-in) — never two modals at once, and never a price before an account exists.
 */
export type UnlockSource = "card" | "fix" | "persona" | "track" | "simulator" | "annotation";

interface UnlockOfferCtx {
  enabled: boolean;
  isAnon: boolean;
  analysisId: string;
  /** Opens the modal (click-only). */
  open: (source: UnlockSource) => void;
  /** Where the primary CTA goes. */
  href: string;
  /** Number of fixes still locked (for the card copy). */
  lockedFixes: number;
}

const Ctx = createContext<UnlockOfferCtx>({
  enabled: false,
  isAnon: false,
  analysisId: "",
  open: () => {},
  href: "#",
  lockedFixes: 0,
});

export function useUnlockOffer(): UnlockOfferCtx {
  return useContext(Ctx);
}

const PRO_HREF = "/app/checkout?plan=pro&interval=month";

export function UnlockOfferProvider({
  enabled,
  analysisId,
  isAnon,
  lockedFixes,
  children,
}: {
  enabled: boolean;
  analysisId: string;
  isAnon: boolean;
  lockedFixes: number;
  children: ReactNode;
}) {
  const [source, setSource] = useState<UnlockSource | null>(null);
  const href = isAnon
    ? `/sign-up?next=${encodeURIComponent(`/app/unlock/${analysisId}`)}`
    : `/app/unlock/${analysisId}`;

  const open = useCallback(
    (s: UnlockSource) => {
      phCapture("unlock_cta_click", { analysis_id: analysisId, source: s });
      // The card's button is a plain link; every OTHER locked surface opens the modal.
      if (s !== "card") {
        setSource(s);
        phCapture("unlock_modal_opened", { analysis_id: analysisId, source: s });
      }
    },
    [analysisId],
  );

  // `report_locked_viewed`: once per audit, when a viewer without the full report sees locked content.
  const viewed = useRef(false);
  useEffect(() => {
    if (!enabled || viewed.current) return;
    viewed.current = true;
    try {
      if (sessionStorage.getItem(`ev_locked_viewed_${analysisId}`)) return;
      sessionStorage.setItem(`ev_locked_viewed_${analysisId}`, "1");
    } catch {
      /* analytics best-effort */
    }
    phCapture("report_locked_viewed", { analysis_id: analysisId, anonymous: isAnon });
  }, [enabled, analysisId, isAnon]);

  const value = useMemo<UnlockOfferCtx>(
    () => ({ enabled, isAnon, analysisId, open, href, lockedFixes }),
    [enabled, isAnon, analysisId, open, href, lockedFixes],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && <ReportUnlockDialog open={source !== null} onClose={() => setSource(null)} source={source} />}
    </Ctx.Provider>
  );
}

/** The inline card — placed under the locked fixes. A plain link for the main action (no pop-up). */
export function ReportUnlockCard({ className }: { className?: string }) {
  const { t } = useT();
  const { enabled, href, analysisId, lockedFixes, isAnon } = useUnlockOffer();
  if (!enabled) return null;
  const n = Math.max(1, lockedFixes);
  return (
    <div
      data-unlock-card
      className={
        "mt-4 rounded-xl border border-champagne-400/20 bg-gradient-to-br from-champagne-400/[0.06] to-signal-600/[0.04] p-4 text-center " +
        (className ?? "")
      }
    >
      <p className="text-sm font-medium text-white">
        {fill(t(n === 1 ? "unlock.cardTitleOne" : "unlock.cardTitleMany"), { n })}
      </p>
      <p className="mt-1 text-xs text-white/60">{t("unlock.cardPrice")}</p>
      <Link
        href={href}
        onClick={() => phCapture("unlock_cta_click", { analysis_id: analysisId, source: "card", anonymous: isAnon })}
        className="mt-3 inline-block"
      >
        <Button variant="primary" size="sm">
          <Lock className="size-4" />
          {t(isAnon ? "unlock.cardCtaAnon" : "unlock.cardCta")}
        </Button>
      </Link>
      <p className="mt-2.5 text-[11px] text-white/45">
        <Link
          href={PRO_HREF}
          onClick={() => phCapture("unlock_pro_link_click", { analysis_id: analysisId, source: "card" })}
          className="underline-offset-2 hover:text-white hover:underline"
        >
          {t("unlock.proLink")}
        </Link>
      </p>
    </div>
  );
}

/** Click-only modal. X always visible, "Not now" always available, no timers, no scarcity. */
function ReportUnlockDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source: UnlockSource | null }) {
  const { t } = useT();
  const { href, analysisId, isAnon } = useUnlockOffer();
  const items = ["i1", "i2", "i3", "i4", "i5"] as const;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-white/[0.08] bg-obsidian-900">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{t("unlock.modalTitle")}</DialogTitle>
          <DialogDescription className="text-white/55">{t("unlock.modalBody")}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {items.map((k) => (
            <li key={k} className="flex items-start gap-2.5 text-sm text-white/75">
              <Check className="mt-0.5 size-4 shrink-0 text-signal-300" />
              {t(`unlock.${k}`)}
            </li>
          ))}
        </ul>
        <div className="space-y-2.5">
          <Link
            href={href}
            onClick={() => phCapture("unlock_cta_click", { analysis_id: analysisId, source: source ?? "card", anonymous: isAnon, from: "modal" })}
            className="block"
          >
            <Button variant="primary" size="lg" className="w-full">
              <Lock className="size-4" />
              {t(isAnon ? "unlock.modalCtaAnon" : "unlock.modalCta")}
            </Button>
          </Link>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/45">
            <ShieldCheck className="size-3.5" />
            {t("unlock.oneTime")}
          </p>
          <div className="flex items-center justify-between pt-1 text-xs">
            <Link
              href={PRO_HREF}
              onClick={() => phCapture("unlock_pro_link_click", { analysis_id: analysisId, source: "modal" })}
              className="text-white/50 underline-offset-2 hover:text-white hover:underline"
            >
              {t("unlock.proLink")}
            </Link>
            <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
              {t("unlock.notNow")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Inline link used inside other locked cards ("or see what it includes") — opens the modal. */
export function UnlockInlineButton({ source, children, className }: { source: UnlockSource; children: ReactNode; className?: string }) {
  const { open } = useUnlockOffer();
  return (
    <button type="button" onClick={() => open(source)} className={className}>
      {children}
    </button>
  );
}

/**
 * Notices after the checkout: "unlocked ✓" (`?unlocked=1`) or "nothing was charged" (`?unlock=canceled`).
 * Shown only when they are true for the viewer, and dismissible.
 */
export function UnlockNotices({ unlocked, offerEnabled }: { unlocked: boolean; offerEnabled: boolean }) {
  const { t } = useT();
  const [hidden, setHidden] = useState(false);
  const [param, setParam] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParam(q.get("unlocked") === "1" ? "unlocked" : q.get("unlock") === "canceled" ? "canceled" : null);
  }, []);
  if (hidden || !param) return null;
  const show = param === "unlocked" ? unlocked : offerEnabled;
  if (!show) return null;
  return (
    <div
      role="status"
      className={
        "mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm " +
        (param === "unlocked" ? "border-signal-500/30 bg-signal-600/10 text-signal-200" : "border-white/10 bg-white/[0.03] text-white/70")
      }
    >
      <span>{t(param === "unlocked" ? "unlock.bannerUnlocked" : "unlock.bannerCanceled")}</span>
      <button type="button" onClick={() => setHidden(true)} className="shrink-0 text-white/50 hover:text-white" aria-label={t("common.close")}>
        ×
      </button>
    </div>
  );
}
