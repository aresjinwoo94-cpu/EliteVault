"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, TrendingUp, RefreshCw, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/supabase/types";
import {
  computePlacement,
  compositeOf,
  progressToNextRank,
} from "@/lib/growth-map/placement";
import { scaffoldNodes, scaffoldDiagnosis } from "@/lib/growth-map/phrase-bank";
import { resolveNicheLabel } from "@/lib/growth-map/niche";
import { rankByIndex, RANKS } from "@/lib/growth-map/ranks";
import { classifyPageKind } from "@/lib/analyzer/page-kind";
import { gateForViewer } from "@/lib/growth-map/gate";
import type { GrowthMapData } from "@/lib/growth-map/types";
import { useT } from "@/components/i18n/locale-provider";
import { MapCanvas, NODE_POS, VIEWBOX } from "./map-canvas";
import { NodeCard } from "./node-card";
import { ExportButton } from "./export-button";

/**
 * THE GROWTH MAP — hero of the analyzer result (spec §8, at the TOP). Additive:
 * reads the finished audit it's handed, never touches the analyzer pipeline.
 *
 * Interaction (spec §7): the feedback is NOT a big paragraph up top. Each rank
 * node is an interactive pin — hover / tap / keyboard-focus opens a small
 * popover with that node's store-specific feedback; the current node
 * (YOUR STORE) opens by default as the main diagnosis; nodes ahead are locked
 * for Free with an inline Pro hook. One popover at a time; Esc restores the
 * default. The map fits its container with no native scrollbar (spec §2).
 */
export function GrowthMap({
  analysisId,
  result,
  url,
  isPaid,
  mapSpine = false,
}: {
  analysisId: string;
  result: AnalysisResult;
  url: string | null;
  isPaid: boolean;
  /**
   * Master brief §B — when true the stage is the hero: the 0–100 badge is
   * replaced by an intra-stage progress bar toward the next rank plus the $
   * potential band. Off ⇒ the score badge renders exactly as before.
   */
  mapSpine?: boolean;
}) {
  const { t } = useT();
  // WP-B — derived here from the same pure classifier the server uses, rather
  // than plumbed through props: one source of truth, and it works for audits
  // stored before pageKind was persisted.
  const pageKind = useMemo(() => classifyPageKind(url), [url]);
  const domain = useMemo(() => {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }, [url]);

  // Phase 1 — deterministic, instant seed (gated exactly like the server).
  const seed = useMemo<GrowthMapData>(() => {
    const placement = computePlacement(result);
    const nicheLabel = resolveNicheLabel({ url, summary: result.summary ?? null });
    const base: GrowthMapData = {
      version: 0,
      placement,
      nodes: scaffoldNodes(placement, nicheLabel, { lockNext: false }),
      diagnosis: scaffoldDiagnosis(placement, nicheLabel),
      source: "scaffold",
      nicheLabel,
      generatedAt: "",
    };
    return gateForViewer(base, isPaid);
  }, [result, url, isPaid]);

  const [data, setData] = useState<GrowthMapData>(seed);
  const current = data.placement.rankIndex;
  // Nothing open by default — feedback stays hidden until you hover/tap a rank
  // (like the numbered pins on the annotated screenshot).
  // FIX 3 — the assigned rank is selected by default (its feedback + the fixes
  // index are the first thing visible), not an empty "hover any rank" prompt.
  // `current` is derived from the deterministic seed placement, so it's stable
  // and available synchronously on first render.
  const [openIndex, setOpenIndex] = useState<number | null>(current);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);

  // FIX 3 — Esc / click-outside / mouse-leave restore the ASSIGNED rank, not an
  // empty state.
  const closeAll = useCallback(() => setOpenIndex(current), [current]);

  // Phase 2 — fetch AI copy (cached server-side; one call per store).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/analyses/${analysisId}/growth-map`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as GrowthMapData;
        if (alive && next?.nodes?.length) {
          setData(next);
        }
      } catch {
        /* keep the scaffold — a valid, honest render */
      }
    })();
    return () => {
      alive = false;
    };
  }, [analysisId]);

  // Esc restores the default (current-node) popover; click outside the map too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAll();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [closeAll]);

  const reduce = useReducedMotion();
  const rank = rankByIndex(current);
  // §1.1 — the projected "potential" rank (only when it genuinely advances).
  const projection = data.projection;
  const ghostIndex =
    projection && projection.advances ? projection.rankIndex : null;
  const ghostRank = ghostIndex != null ? rankByIndex(ghostIndex) : null;
  // §1.2 — movement vs the previous run for this domain, if any.
  const movement = data.movement;
  const openNode = openIndex != null ? data.nodes[openIndex] : null;
  const openPos = openIndex != null ? NODE_POS[openIndex] : null;
  // Caret x for the detail band, clamped so it never runs off the card edge.
  const caretLeft = openPos ? Math.min(94, Math.max(6, openPos.xPct)) : 50;
  const displayScore = Math.round(result.score > 1 ? result.score : result.score * 100);
  // §B/§A3 — intra-stage progress toward the next rank, the face that replaces
  // the 0–100 badge when the map-spine flag is on. Pure, client-side.
  const composite = compositeOf(result);
  const progress = progressToNextRank(composite, current);
  const nextRank = progress.nextRankKey ? rankByIndex(current + 1) : null;
  const progressPct = Math.round(progress.pct * 100);

  // FIX 2 (revised) — the assigned rank's band is a compact NAVIGATION INDEX of
  // the report's three LENSES on this store's analysis, NOT a re-list of the
  // fixes that already sit right below (which read as repetitive). Each lens is
  // derived from the real result — the EliteVault criterion — and deep-links to
  // its section: the top fixes ranked by leverage, the annotated audit, and
  // where the store is leaking sales (its weakest conversion dimension). Every
  // lens carries a store-specific count/label so it's tied to THIS analysis, not
  // a static menu. Pure/client-side, zero latency, no pipeline touch.
  const reportLenses = useMemo(() => {
    const norm = (v?: number) => {
      const n = Number(v ?? 0);
      return !Number.isFinite(n) ? 0 : Math.round(Math.max(0, Math.min(100, n > 1 ? n : n * 100)));
    };
    const CAT_LABELS: Record<string, string> = {
      cro_principles: "Conversion fundamentals",
      niche_coherence: "Offer clarity",
      technical_optimization: "Technical health",
      layout_proportion: "Layout & hierarchy",
      image_quality: "Imagery",
      color_integration: "Visual cohesion",
    };
    const cats = result.category_scores as Record<string, number> | undefined;
    const fixesCount = (result.top_fixes ?? []).filter((f) => f?.title?.trim()).length;
    const annCount = (result.annotations ?? []).length;

    // The single weakest dimension is the honest "where you're leaking" anchor.
    let weakest: { label: string; v: number } | null = null;
    if (cats) {
      for (const [k, label] of Object.entries(CAT_LABELS)) {
        const v = norm(cats[k]);
        if (!weakest || v < weakest.v) weakest = { label, v };
      }
    }

    const out: {
      key: string;
      label: string;
      hint: string;
      section: string;
      sectionLabel: string;
    }[] = [];
    if (fixesCount > 0)
      out.push({
        key: "fixes",
        label: t("report.lensFixes"),
        hint: t("report.lensFixesHint").replace("{n}", String(fixesCount)),
        section: "section-fixes",
        sectionLabel: "Priority Fixes",
      });
    if (annCount > 0)
      out.push({
        key: "audit",
        label: t("report.lensAudit"),
        hint: t("report.lensAuditHint").replace("{n}", String(annCount)),
        section: "section-audit",
        sectionLabel: "Annotated Audit",
      });
    if (weakest)
      out.push({
        key: "leaks",
        label: t("report.lensLeaks"),
        hint: `${weakest.label} · ${weakest.v}`,
        section: "section-leaks",
        sectionLabel: "Leak map",
      });
    return out;
  }, [result, t]);
  const nextFixTitle = result.top_fixes?.find((f) => f?.title?.trim())?.title?.trim() ?? null;

  // FIX 2 — smooth-scroll to a report section (the mechanism ReportNav used).
  const jumpToSection = useCallback((id: string) => {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const wallVerdict = result.ad_readiness?.verdict;
  const WALL_VERDICT_META: Record<string, { dot: string; label: string }> = {
    ready: { dot: "#22C55E", label: t("report.wallAdReady") },
    almost: { dot: "#EAB308", label: t("report.wallAdAlmost") },
    not_ready: { dot: "#EF4444", label: t("report.wallAdNot") },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="glow-card relative overflow-hidden p-4 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-signal-500/10 blur-3xl" />

        {/* §D — the return visit OPENS with what changed. Issue-delta is the
            protagonist (resolved / new); the stage move is the secondary line.
            Deterministic copy, 0 tokens. Present only when the issue-diff flag is
            on server-side AND a prior run persisted issue snapshots. */}
        {movement?.issueDelta &&
          (movement.issueDelta.resolved.length > 0 ||
            movement.issueDelta.introduced.length > 0) && (
            <div className="relative mb-4 overflow-hidden rounded-xl border border-signal-400/25 bg-signal-500/[0.05] px-4 py-3.5">
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-white/45">
                {t("report.changedSince").replace(
                  "{date}",
                  new Date(movement.previousAt).toLocaleDateString(),
                )}
              </p>
              <div className="mt-2 space-y-2">
                {movement.issueDelta.resolved.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="mt-[3px] shrink-0 rounded-full bg-[#22C55E]/15 px-2 py-[1px] text-[10px] font-semibold text-[#22C55E]">
                      {t("report.changedResolved")}
                    </span>
                    <p className="min-w-0 text-[12px] leading-relaxed text-white/80">
                      {movement.issueDelta.resolved.map((i) => i.title).join(" · ")}
                    </p>
                  </div>
                )}
                {movement.issueDelta.introduced.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="mt-[3px] shrink-0 rounded-full bg-champagne-300/15 px-2 py-[1px] text-[10px] font-semibold text-champagne-200">
                      {t("report.changedNew")}
                    </span>
                    <p className="min-w-0 text-[12px] leading-relaxed text-white/70">
                      {movement.issueDelta.introduced.map((i) => i.title).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] text-white/45">
                {movement.rankMoveConfident &&
                movement.currentRankIndex !== movement.previousRankIndex
                  ? t("report.changedStageLine")
                      .replace("{from}", rankByIndex(movement.previousRankIndex).material)
                      .replace("{to}", rankByIndex(movement.currentRankIndex).material)
                  : t("report.changedStageFlat")}
                {movement.issueDelta.stillOpen.length > 0 && (
                  <span className="text-white/35">
                    {" · "}
                    {t("report.changedStillOpen").replace(
                      "{count}",
                      String(movement.issueDelta.stillOpen.length),
                    )}
                  </span>
                )}
              </p>
            </div>
          )}

        {/* Minimal header (spec §7/§8) — short headline; detail lives in popovers */}
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-[0.2em] text-white/40">
              EliteVault Growth Map
            </p>
            <h2 className="mt-1 font-display text-xl md:text-2xl tracking-tight leading-tight">
              You&apos;re at <span className="text-gold-gradient">{rank.material}</span>
              {data.placement.atWallEdge && (
                <span className="text-white/60"> — one step from The Wall</span>
              )}
            </h2>
            {/* §C — the ad-readiness semáforo lives AT the Wall: clearing it is
                what makes the store ad-ready. Just the light here; the full
                blockers list stays in its own card below. */}
            {mapSpine && wallVerdict && WALL_VERDICT_META[wallVerdict] && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-white/70">
                <span
                  className="size-2 rounded-full"
                  style={{ background: WALL_VERDICT_META[wallVerdict].dot }}
                  aria-hidden
                />
                {t("report.wallPrefix")} · {WALL_VERDICT_META[wallVerdict].label}
              </div>
            )}
            {/* §1.3 — reads the map honestly: readiness, not revenue. */}
            <p className="mt-1.5 text-[11.5px] leading-snug text-white/45 max-w-[52ch]">
              {t("report.mapIntro")}
            </p>
            {/* WP-B — the map places a STORE on a stage, but the audit may have
                been pointed at a single page. Saying so is the difference
                between a projection and an overclaim about the business. */}
            {pageKind === "product" || pageKind === "collection" ? (
              <p className="mt-1.5 text-[11.5px] leading-snug text-champagne-300/70 max-w-[52ch]">
                {t(
                  pageKind === "product"
                    ? "report.pageKindProduct"
                    : "report.pageKindCollection",
                )}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {domain && (
                <span className="font-mono text-[11px] text-white/45 truncate max-w-[200px]">
                  {domain}
                </span>
              )}
              {mapSpine ? (
                <Badge
                  variant="default"
                  className="font-mono tnum border-champagne-300/30 text-champagne-200"
                >
                  {t("report.potentialBand").replace("{band}", rank.band)}
                </Badge>
              ) : (
                <Badge variant="default" className="font-mono tnum">
                  {displayScore}/100
                </Badge>
              )}
              <Badge variant="ai">{data.nicheLabel}</Badge>
              {/* §1.2 — re-run movement: how far this store moved since last time. */}
              {movement && (
                <Badge
                  variant="default"
                  className="font-mono tnum border-signal-400/40 text-signal-200"
                >
                  {movement.previousComposite} → {movement.currentComposite}
                  {movement.crossedWall && movement.rankMoveConfident
                    ? " · crossed The Wall"
                    : movement.rankMoveConfident &&
                        movement.currentRankIndex > movement.previousRankIndex
                      ? " · advanced"
                      : ""}
                </Badge>
              )}
            </div>

            {/* §B/§A3 — intra-stage progress bar: the visible face of a fix that
                lifts the store without (yet) crossing a rank. Only in spine mode;
                the score badge above is otherwise the face. */}
            {mapSpine && (
              <div className="mt-2.5 max-w-[320px]">
                {nextRank ? (
                  <>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-white/55">
                        {t("report.stageToNext")
                          .replace("{pts}", String(progress.toNextEdge))
                          .replace("{next}", nextRank.material)}
                      </span>
                      <span className="tnum text-white/40">{progressPct}%</span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
                      role="progressbar"
                      aria-valuenow={progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t("report.stageProgressAria")
                        .replace("{pct}", String(progressPct))
                        .replace("{next}", nextRank.material)}
                    >
                      <div
                        className="h-full rounded-full bg-[image:var(--grad-brand)]"
                        style={{ width: `${Math.max(4, progressPct)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] text-white/45">
                    {t("report.stageTopRank")}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] px-3 py-1.5 text-[10.5px] text-white/45">
              <span className="size-2 rounded-full bg-[image:var(--grad-brand)]" />
              Growth Map™ · calibrated with your Library
            </span>
          </div>
        </div>

        {/* Interactive area: a flat, horizontal map + a detail band below it.
            Leaving the whole area with the mouse closes; hovering the band keeps
            the current rank open so its CTA stays reachable. */}
        <div
          ref={containerRef}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") closeAll();
          }}
          className="mt-3"
        >
          {/* On phones the 5.3:1 canvas would shrink to ~52px tall and become
              illegible/untappable. Instead we let it keep a legible minimum
              width and scroll horizontally, with a hint below. */}
          <div className="overflow-x-auto">
          <div
            className="relative min-w-[720px]"
            style={{ aspectRatio: `${VIEWBOX.w} / ${VIEWBOX.h}` }}
          >
            <div ref={svgWrapRef} className="absolute inset-0">
              <MapCanvas
                currentIndex={current}
                openIndex={openIndex}
                ghostIndex={ghostIndex}
              />
            </div>

            {/* Accessible hit-targets over each medallion */}
            {RANKS.map((r, i) => {
              const pos = NODE_POS[i];
              const label =
                i === current
                  ? `${r.material}, your store — read diagnosis`
                  : `${r.material}, ${r.stage} — read feedback`;
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-label={label}
                  aria-expanded={openIndex === i}
                  aria-controls="gm-detail"
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setOpenIndex(i);
                  }}
                  onFocus={() => setOpenIndex(i)}
                  onClick={() => setOpenIndex(i)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-signal-400/70 min-w-[44px] min-h-[44px]"
                  style={{
                    left: `${pos.xPct}%`,
                    top: `${pos.yPct}%`,
                    width: "8%",
                    height: "26%",
                  }}
                />
              );
            })}
          </div>
          </div>
          <p className="mt-1.5 text-[11px] text-white/30 md:hidden">
            ← swipe to see the full map →
          </p>

          {/* Announcement — the $ ranges are POTENTIAL, not revenue. Given real
              weight (brand-gradient chip) so it reads as a statement, not a
              footnote, right where the $ figures live. */}
          <div className="relative mt-3 overflow-hidden rounded-xl border border-signal-400/30 bg-signal-500/[0.07] px-4 py-3.5">
            <div className="pointer-events-none absolute -left-8 -top-10 size-24 rounded-full bg-signal-500/15 blur-2xl" />
            <div className="relative flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[image:var(--grad-brand)]">
                <TrendingUp className="size-4 text-black/85" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[13.5px] font-semibold leading-tight text-white">
                  {t("report.potentialTitle")}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">
                  {t("report.potentialBody")}
                </p>
              </div>
            </div>
          </div>

          {/* Free / signed-out viewers don't get the Pro escape route, so give
              them the honest path up: re-run after every fix. Champagne accent
              differentiates it from the teal potential banner above. */}
          {!isPaid && (
            <div className="relative mt-2 overflow-hidden rounded-xl border border-champagne-300/25 bg-champagne-300/[0.05] px-4 py-3.5">
              <div className="relative flex items-start gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-champagne-300/30 bg-champagne-300/10">
                  <RefreshCw className="size-4 text-champagne-300" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[13.5px] font-semibold leading-tight text-white">
                    {t("report.rerunTitle")}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">
                    {t("report.rerunBody")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Detail band — feedback / upgrade ad appears HERE, below the map, so
              it never overlaps the route or the header (owner feedback). A caret
              points up to the hovered rank. */}
          <div
            id="gm-detail"
            className="relative mt-2 flex min-h-[86px] items-center rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
          >
            {openNode && (
              <span
                aria-hidden
                className="pointer-events-none absolute -top-[6px] size-3"
                style={{
                  left: `${caretLeft}%`,
                  transform: "translateX(-50%) rotate(45deg)",
                  background: "#0d0d14",
                  borderLeft: `1px solid ${
                    openNode.role === "current"
                      ? "rgba(45,212,191,0.4)"
                      : "rgba(255,255,255,0.08)"
                  }`,
                  borderTop: `1px solid ${
                    openNode.role === "current"
                      ? "rgba(45,212,191,0.4)"
                      : "rgba(255,255,255,0.08)"
                  }`,
                }}
              />
            )}
            <div className="w-full">
              {/* FIX 3 — the assigned rank is open by default, so there is no
                  empty "hover any rank" state; other ranks stay clickable. */}
              <AnimatePresence mode="wait" initial={false}>
                {openNode && (
                  <motion.div
                    key={openIndex}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    <NodeCard node={openNode} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* §C + FIX 2 (revised) — the CURRENT node reveals a NAVIGATION
                  INDEX of the report's three lenses on this store's analysis (top
                  fixes ranked by leverage, annotated audit, where you're leaking
                  sales) instead of re-listing the fixes that sit right below. Each
                  lens deep-links to its section; gating on the actual content
                  stays at the destination (Priority Fixes still shows 1 for Free).
                  The current→next node reveals the escalera (the #1 fix). */}
              {mapSpine && openIndex === current && reportLenses.length > 0 && (
                <div className="mt-2.5 border-t border-white/[0.05] pt-2.5">
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40">
                    {nextRank
                      ? t("report.fixIndexHeading").replace("{next}", nextRank.material)
                      : t("report.fixIndexHeadingTop")}
                  </p>
                  <div className="flex flex-col gap-1">
                    {reportLenses.map((lens) => (
                      <button
                        key={lens.key}
                        type="button"
                        onClick={() => jumpToSection(lens.section)}
                        className="group flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left transition-colors hover:border-signal-400/30 hover:bg-signal-500/[0.06]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-white/85">
                            {lens.label}
                          </span>
                          <span className="block truncate text-[10.5px] text-white/40">
                            {lens.hint}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-white/35 group-hover:text-signal-300">
                          {lens.sectionLabel}
                          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {mapSpine && openIndex === current + 1 && nextFixTitle && (
                <div className="mt-2.5 border-t border-white/[0.05] pt-2.5">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
                    {t("report.climbHeading")}
                  </p>
                  <p className="text-[12px] leading-snug text-white/80">
                    {nextFixTitle}
                  </p>
                  {!isPaid && (result.top_fixes?.length ?? 0) > 1 && (
                    <p className="mt-1 text-[11px] text-signal-200/80">
                      {t("report.climbMoreFixes").replace(
                        "{count}",
                        String((result.top_fixes?.length ?? 1) - 1),
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* §1.1/§1.3 — the current→ghost gap: what the top fixes unlock, and
              the re-run CTA that turns the map into a retention loop. */}
          {ghostRank && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-signal-400/25 bg-signal-500/[0.06] px-4 py-2.5 text-[12px]">
              <span className="font-sans font-semibold text-signal-200">
                Potential: {rank.material} → {ghostRank.material}
              </span>
              {projection && projection.liftFixes.length > 0 && (
                <span className="text-white/60">
                  by fixing {projection.liftFixes.join(", ")}.
                </span>
              )}
              <span className="text-white/75">{t("report.rerunCta")}</span>
            </div>
          )}
        </div>

        {/* Footer — citations + branded export (spec §3/§8) */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.06] pt-3">
          <p className="text-[10.5px] leading-relaxed text-white/40 max-w-[60ch]">
            Stages after Churchill &amp; Lewis, “The Five Stages of Small Business
            Growth” (HBR 1983). The Wall: Olson et al., “When Growth Stalls” (HBR
            2008) — ~87% of companies stall. Dollar bands are EliteVault’s
            approximate overlay, not a claim about your revenue.
          </p>
          <ExportButton
            getSvg={() => svgWrapRef.current?.querySelector("svg") ?? null}
            domain={domain}
            title={`Your store · ${rank.material} · ${rank.stage}`}
            body={data.nodes[current]?.text}
          />
        </div>

        {/* Scroll nudge — the report continues below (fixes, persona, tools) */}
        <div className="mt-4 flex items-center justify-center gap-2.5 rounded-xl border border-signal-400/20 bg-signal-500/[0.06] px-4 py-2.5 text-center">
          <span className="text-[12px] text-white/75">
            Your full audit continues below — prioritized fixes, buyer-persona
            &amp; Meta tools.
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-signal-300 ${reduce ? "" : "motion-safe:animate-bounce"}`}
          />
        </div>
      </Card>
    </motion.div>
  );
}
