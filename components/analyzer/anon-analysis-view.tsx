"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import posthog from "posthog-js";
import {
  ArrowRight,
  ArrowLeft,
  Lock,
  Sparkles,
  Shield,
  MessageSquare,
  TrendingUp,
  Zap,
  Flame,
  Scale as ScaleIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AnalyzingState } from "./analyzing-state";
import { AnnotationsOverlay } from "./annotations-overlay";
import { CategoryRadar } from "./category-radar";
import { AdReadinessCard } from "./ad-readiness";
import { roasRangeForAudit } from "@/lib/meta/roas-range";
import { useT } from "@/components/i18n/locale-provider";
import type { Annotation, AdReadiness, AnalysisResult } from "@/lib/supabase/types";

/** A ranked fix as seen by an anonymous viewer — title + impact only, the
 *  how-to/why is never sent (that's the locked "cure"). */
interface AnonFix {
  title: string;
  impact: "high" | "medium" | "low";
}

/**
 * DTO returned by /api/anon-analyses/[id]. It carries the free DIAGNOSIS — the
 * same roadmap context a free logged-in user sees (score, verdict, categories,
 * annotated screenshot, ad-readiness, ranked issue titles) — but never the paid
 * "cure" (fix how-to/why, buyer-persona response, full Meta projection). The
 * gate holds at the network boundary: the cure is unlocked by creating a free
 * account, and Pro/Scale from there.
 */
export interface AnonAudit {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "refunded";
  url: string | null;
  screenshot_url: string | null;
  error: string | null;
  preview_score: number | null;
  preview_summary: string | null;
  score: number | null;
  summary: string | null;
  annotations: Annotation[];
  category_scores: AnalysisResult["category_scores"] | null;
  ad_readiness: AdReadiness | null;
  fixes: AnonFix[];
  fixes_total: number;
}

/** Where cold traffic goes to become an account — carries no PII in the URL. */
const SIGNUP_HREF = "/sign-up?next=/app/analyzer";

function capture(event: string, props?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (posthog as { __loaded?: boolean }).__loaded) {
      posthog.capture(event, props);
    }
  } catch {
    /* analytics is best-effort */
  }
}

export function AnonAnalysisView({ initial }: { initial: AnonAudit }) {
  const { t } = useT();
  const [data, setData] = useState<AnonAudit>(initial);
  const [gateOpen, setGateOpen] = useState(false);
  const statusRef = useRef(data.status);
  // Keep the ref in sync OUTSIDE render so the poll interval reads the live
  // status without re-creating the interval (avoids stale-closure polling).
  useEffect(() => {
    statusRef.current = data.status;
  }, [data.status]);
  // Fire completion + gate events exactly once.
  const firedComplete = useRef(false);

  const isWorking = data.status === "queued" || data.status === "running";
  const isDone = data.status === "succeeded";
  const isFailed = data.status === "failed" || data.status === "refunded";

  // Poll the anon status endpoint until the audit reaches a terminal state.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (statusRef.current !== "queued" && statusRef.current !== "running") {
        return;
      }
      try {
        const res = await fetch(`/api/anon-analyses/${data.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as AnonAudit;
        if (!alive) return;
        setData(next);
      } catch {
        /* network blip — retry next tick */
      }
    };
    tick();
    const timer = setInterval(tick, 1800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [data.id]);

  // On completion: fire the funnel event and raise the registration gate ONCE
  // (persisted in sessionStorage so a reload doesn't re-nag). This is the peak
  // of intent — right after the "aha".
  useEffect(() => {
    if (!isDone || firedComplete.current) return;
    firedComplete.current = true;
    capture("anon_audit_completed", { id: data.id, score: data.score });
    let alreadyShown = false;
    try {
      alreadyShown =
        sessionStorage.getItem(`ev_anon_gate_${data.id}`) === "1";
    } catch {
      /* storage blocked — show once this render */
    }
    if (!alreadyShown) {
      setGateOpen(true);
      capture("anon_gate_shown", { id: data.id, score: data.score });
      try {
        sessionStorage.setItem(`ev_anon_gate_${data.id}`, "1");
      } catch {
        /* ignore */
      }
    }
  }, [isDone, data.id, data.score]);

  const onSignupClick = useCallback(() => {
    capture("anon_gate_signup_click", { id: data.id, score: data.score });
  }, [data.id, data.score]);

  const roundedScore =
    data.score != null
      ? Math.round(data.score > 1 ? data.score : data.score * 100)
      : null;

  // Niche inferred from the domain, the same way the analyzer pipeline does —
  // drives the honest ROAS band in the Meta teaser.
  const niche = (() => {
    try {
      return data.url
        ? new URL(data.url).hostname.replace(/^www\./, "").split(".")[0]
        : "ecommerce";
    } catch {
      return "ecommerce";
    }
  })();

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="size-3" />
          {t("anonReveal.back")}
        </Link>
        <span className="truncate text-xs text-white/40">{data.url}</span>
      </header>

      {isWorking && (
        <AnalyzingState
          status={data.status as "queued" | "running"}
          startedAt={null}
          previewScore={data.preview_score}
          previewSummary={data.preview_summary}
        />
      )}

      {isFailed && (
        <Card className="border-destructive/30 bg-destructive/[0.03] p-8 text-center">
          <h2 className="font-serif text-2xl tracking-tight">
            {t("anonReveal.failedTitle")}
          </h2>
          {data.error && (
            <p className="mt-3 text-sm text-white/60 max-w-md mx-auto leading-relaxed">
              {data.error}
            </p>
          )}
          <Link href="/" className="mt-6 inline-block">
            <Button variant="primary">{t("anonReveal.failedRetry")}</Button>
          </Link>
        </Card>
      )}

      {isDone && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {/* 1 — Score hero + the model's verdict, so the number has context. */}
          <Card className="relative overflow-hidden p-8 md:p-10 text-center">
            <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-signal-600/10 blur-3xl" />
            <p className="relative text-xs uppercase tracking-widest text-white/45">
              {t("anonReveal.scoreEyebrow")}
            </p>
            <div className="relative mt-3 font-serif text-7xl md:text-8xl leading-none text-gold-gradient">
              {roundedScore ?? "—"}
              <span className="text-3xl text-white/30">/100</span>
            </div>
            {data.summary ? (
              <p className="relative mx-auto mt-5 max-w-xl text-sm md:text-base text-white/70 leading-relaxed">
                {data.summary}
              </p>
            ) : (
              <p className="relative mt-4 max-w-md mx-auto text-sm text-white/55 leading-relaxed">
                {t("anonReveal.scoreCaption")}
              </p>
            )}
          </Card>

          {/* 2 — Visual diagnosis: annotated screenshot + category breakdown. */}
          <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
            {data.screenshot_url && (
              <div className="min-w-0">
                <AnnotationsOverlay
                  imageUrl={data.screenshot_url}
                  annotations={data.annotations ?? []}
                />
              </div>
            )}
            {data.category_scores && (
              <div className="min-w-0">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-white/40">
                  {t("anonReveal.diagnosisEyebrow")}
                </p>
                <CategoryRadar scores={data.category_scores} />
              </div>
            )}
          </div>

          {/* 3 — Ranked issues: titles + impact visible, the how-to locked. */}
          {data.fixes.length > 0 && (
            <AnonIssuesList fixes={data.fixes} onSignupClick={onSignupClick} />
          )}

          {/* 4 — "Ready for Meta traffic?" — the media-buyer verdict (free). */}
          {data.ad_readiness && <AdReadinessCard data={data.ad_readiness} />}

          {/* 5 — What this means for your ads: honest modeled ROAS range. */}
          {roundedScore != null && (
            <AnonMetaTeaser score={roundedScore} niche={niche} onSignupClick={onSignupClick} />
          )}

          {/* 6 — Locked cure + registration gate (seeds Pro/Scale). */}
          <AnonLockedGate
            fixesTotal={data.fixes_total}
            onSignupClick={onSignupClick}
          />
        </motion.div>
      )}

      {/* Registration modal (Modal R). Close (X) always available via Dialog;
          plus an explicit "Maybe later". No countdown, no fake scarcity. */}
      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("anonGate.title").replace(
                "{score}",
                String(roundedScore ?? "—"),
              )}
            </DialogTitle>
            <DialogDescription>{t("anonGate.body")}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-col gap-2">
            <Link href={SIGNUP_HREF} onClick={onSignupClick}>
              <Button variant="primary" size="lg" className="w-full">
                <Sparkles className="size-4" />
                {t("anonGate.ctaPrimary")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <button
              onClick={() => setGateOpen(false)}
              className="text-xs text-white/40 hover:text-white/70 transition-colors py-1"
            >
              {t("anonGate.ctaSecondary")}
            </button>
          </div>
          <p className="mt-1 inline-flex items-center justify-center gap-1 text-[10px] text-white/35">
            <Shield className="size-3" />
            {t("anonReveal.saved")}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The locked "cure" for an anonymous viewer: three skeleton teasers (fixes,
 * persona, Meta) behind a single, honest registration CTA. Mirrors the
 * FreeLockedCure visual language (blur + champagne/signal glow + lock) so the
 * upgrade surfaces feel like one system.
 */
function AnonLockedGate({
  fixesTotal,
  onSignupClick,
}: {
  fixesTotal: number;
  onSignupClick: () => void;
}) {
  const { t } = useT();
  const teasers = [
    { icon: Zap, label: t("anonReveal.lockedFixes"), count: fixesTotal },
    { icon: MessageSquare, label: t("anonReveal.lockedPersona") },
    { icon: TrendingUp, label: t("anonReveal.lockedMeta") },
  ];
  return (
    <Card className="relative overflow-hidden p-6 md:p-8 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.05] to-signal-600/[0.05]">
      <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-champagne-400" />
          <h3 className="font-medium text-white">{t("anonReveal.lockedTitle")}</h3>
        </div>
        <p className="mt-2 text-sm text-white/55 leading-relaxed max-w-2xl">
          {t("anonReveal.lockedBody")}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {teasers.map(({ icon: Icon, label, count }) => (
            <div
              key={label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="flex items-center justify-between">
                <Icon className="size-4 text-white/50" />
                <Lock className="size-3 text-champagne-400/70" />
              </div>
              <p className="mt-3 text-xs text-white/70">{label}</p>
              {count != null && count > 0 && (
                <Badge variant="default" className="mt-2">
                  {count}
                </Badge>
              )}
              <div className="mt-3 space-y-1.5" aria-hidden>
                <div className="h-1.5 w-full rounded bg-white/[0.06]" />
                <div className="h-1.5 w-3/4 rounded bg-white/[0.06]" />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <Link href={SIGNUP_HREF} onClick={onSignupClick}>
            <Button variant="primary" size="lg">
              <Sparkles className="size-4" />
              {t("anonReveal.cta")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <p className="inline-flex items-center gap-1 text-[11px] text-white/40">
            <Shield className="size-3" />
            {t("anonReveal.saved")}
          </p>
        </div>

        {/* Seed the paid tiers: free is step 1, Pro is where the full cure +
            Meta projection live. Honest, not pushy. */}
        <p className="mt-4 border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-white/45">
          {t("anonReveal.proHint")}
        </p>
      </div>
    </Card>
  );
}

/**
 * Ranked issue list for an anonymous viewer — the store's problems, by impact.
 * Titles + impact chips are shown (real context: "what's wrong and how bad"),
 * but the actionable how-to is never sent, so each row carries a "how-to
 * locked" hint. This mirrors the free logged-in TopFixes shape while routing
 * the unlock to a free account.
 */
function AnonIssuesList({
  fixes,
  onSignupClick,
}: {
  fixes: AnonFix[];
  onSignupClick: () => void;
}) {
  const { t } = useT();
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-champagne-400" />
        <h3 className="text-sm font-medium text-white">
          {t("anonReveal.issuesTitle").replace("{n}", String(fixes.length))}
        </h3>
      </div>
      <p className="mt-1 text-xs text-white/50 leading-relaxed">
        {t("anonReveal.issuesSub")}
      </p>

      <ol className="mt-4 space-y-2">
        {fixes.map((f, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3.5"
          >
            <span className="tnum w-7 text-center font-serif text-2xl text-gold-gradient">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight text-white">{f.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    f.impact === "high"
                      ? "danger"
                      : f.impact === "medium"
                        ? "warning"
                        : "default"
                  }
                >
                  {f.impact} impact
                </Badge>
                <span className="inline-flex items-center gap-1 text-[10px] text-champagne-300/80">
                  <Lock className="size-3" />
                  {t("anonReveal.howToLocked")}
                </span>
              </div>
            </div>
            <Lock className="mt-0.5 size-4 shrink-0 text-white/20" />
          </li>
        ))}
      </ol>

      <Link href={SIGNUP_HREF} onClick={onSignupClick} className="mt-4 inline-block">
        <Button variant="primary" size="sm">
          <Sparkles className="size-4" />
          {t("anonReveal.cta")}
          <ArrowRight className="size-4" />
        </Button>
      </Link>
    </Card>
  );
}

/**
 * "What this means for your ads" for an anonymous viewer — the same honest,
 * deterministic modeled ROAS band the free logged-in user sees
 * (roasRangeForAudit), with the not-ready framing when the band is a net loss.
 * Routes the full day-by-day projection to a free account.
 */
function AnonMetaTeaser({
  score,
  niche,
  onSignupClick,
}: {
  score: number;
  niche: string;
  onSignupClick: () => void;
}) {
  const { t } = useT();
  const range = roasRangeForAudit(score, niche);
  const body = t("anonReveal.metaBody")
    .replace("{roasLow}", range.low.toFixed(1))
    .replace("{roasHigh}", range.high.toFixed(1));

  return (
    <Card className="relative overflow-hidden border-signal-500/20 bg-gradient-to-br from-signal-600/[0.06] to-champagne-400/[0.04] p-6 md:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-signal-600/12 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-signal-300" />
          <span className="text-[10px] uppercase tracking-widest text-white/45">
            {t("anonReveal.metaEyebrow")}
          </span>
        </div>
        <h3 className="mt-3 font-serif text-2xl md:text-3xl tracking-tight text-white text-balance">
          {range.ready
            ? t("anonReveal.metaReadyTitle")
            : t("anonReveal.metaNotReadyTitle")}
        </h3>
        <p className="mt-3 max-w-xl text-sm md:text-base text-white/70 leading-relaxed">
          {body}
        </p>

        {/* Blurred 3-scenario shape — the value they'll get, not the numbers. */}
        <div className="mt-5 grid max-w-md grid-cols-3 gap-2 opacity-70 blur-[3px]" aria-hidden>
          {[
            { Icon: Shield, tint: "text-sky-300" },
            { Icon: ScaleIcon, tint: "text-champagne-300" },
            { Icon: Flame, tint: "text-rose-300" },
          ].map(({ Icon, tint }, i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <Icon className={`size-3.5 ${tint}`} />
              <div className="mt-3 h-6 w-12 rounded bg-white/15" />
              <div className="mt-2 h-1.5 w-full rounded bg-white/[0.08]" />
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs italic text-white/40">
          {t("anonReveal.metaDisclaimer")}
        </p>

        <Link href={SIGNUP_HREF} onClick={onSignupClick} className="mt-5 inline-block">
          <Button variant="primary" size="lg">
            <Sparkles className="size-4" />
            {t("anonReveal.cta")}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
