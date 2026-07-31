"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/supabase/types";
import { computePlacement } from "@/lib/growth-map/placement";
import { scaffoldNodes, scaffoldDiagnosis } from "@/lib/growth-map/phrase-bank";
import { resolveNicheLabel } from "@/lib/growth-map/niche";
import { rankByIndex, RANKS } from "@/lib/growth-map/ranks";
import { gateForViewer } from "@/lib/growth-map/gate";
import type { GrowthMapData } from "@/lib/growth-map/types";
import { MapCanvas, NODE_POS } from "./map-canvas";
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
}: {
  analysisId: string;
  result: AnalysisResult;
  url: string | null;
  isPaid: boolean;
}) {
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
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => setOpenIndex(null), []);

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
  const openNode = openIndex != null ? data.nodes[openIndex] : null;
  const openPos = openIndex != null ? NODE_POS[openIndex] : null;
  const above = openPos ? openPos.yPct > 50 : false;
  const tx = openPos
    ? openPos.xPct < 24
      ? "-12%"
      : openPos.xPct > 76
        ? "-88%"
        : "-50%"
    : "-50%";
  // Locked ranks don't open a rank-anchored popover — they raise a small alert
  // (below), so the pitch never ties to a rank or covers the route.
  const showFeedback = !!openNode && !openNode.locked && !!openPos;
  const showAlert = !!openNode && openNode.locked;
  const displayScore = Math.round(result.score > 1 ? result.score : result.score * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="glow-card relative overflow-hidden p-4 md:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-signal-500/10 blur-3xl" />

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
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {domain && (
                <span className="font-mono text-[11px] text-white/45 truncate max-w-[200px]">
                  {domain}
                </span>
              )}
              <Badge variant="default" className="font-mono tnum">
                {displayScore}/100
              </Badge>
              <Badge variant="ai">{data.nicheLabel}</Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] px-3 py-1.5 text-[10.5px] text-white/45">
              <span className="size-2 rounded-full bg-[image:var(--grad-brand)]" />
              Growth Map™ · calibrated with your Library
            </span>
          </div>
        </div>

        {/* Map + interactive pin overlay */}
        <div
          ref={containerRef}
          className="relative mt-3"
          style={{ aspectRatio: "900 / 320" }}
        >
          <div ref={svgWrapRef} className="absolute inset-0">
            <MapCanvas currentIndex={current} openIndex={openIndex} />
          </div>

          {/* Invisible hit-targets over each medallion (accessible triggers) */}
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
                aria-haspopup="dialog"
                // Mouse: hover to reveal, leave to hide (like the annotated pins).
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setOpenIndex(i);
                }}
                onPointerLeave={(e) => {
                  // Keep a locked rank's alert up so its CTA stays reachable;
                  // it dismisses on Esc / click-outside.
                  if (e.pointerType !== "mouse") return;
                  if (data.nodes[i]?.locked) return;
                  setOpenIndex((p) => (p === i ? null : p));
                }}
                onFocus={() => setOpenIndex(i)}
                onBlur={() =>
                  setOpenIndex((p) =>
                    p === i && !data.nodes[i]?.locked ? null : p,
                  )
                }
                // Touch/click: toggle.
                onClick={() => setOpenIndex((p) => (p === i ? null : i))}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-signal-400/70"
                style={{
                  left: `${pos.xPct}%`,
                  top: `${pos.yPct}%`,
                  width: "8%",
                  height: "22%",
                }}
              />
            );
          })}

          {/* Feedback popover — only for OPEN ranks (current + past), anchored
              to the node (spec §7). Locked ranks use the alert below instead. */}
          {showFeedback && (
            <div
              role="dialog"
              aria-label={`${openNode!.rankKey} feedback`}
              className="pointer-events-auto absolute z-10 w-[218px] max-w-[74vw] rounded-xl border bg-[#0e0e16]/97 p-3 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] motion-safe:transition-[left,top] motion-safe:duration-150"
              style={{
                left: `${openPos!.xPct}%`,
                top: `${openPos!.yPct}%`,
                transform: `translateX(${tx}) translateY(${above ? "calc(-100% - 34px)" : "34px"})`,
                borderColor:
                  openNode!.role === "current"
                    ? "rgba(45,212,191,0.45)"
                    : "rgba(255,255,255,0.06)",
              }}
            >
              <NodeCard node={openNode!} />
            </div>
          )}

          {/* Upgrade ALERT — small, plan-agnostic, NOT tied to a rank and never
              over the route (pinned bottom-right where the ascending path leaves
              the corner empty). Light animation, EliteVault style. */}
          <AnimatePresence>
            {showAlert && (
              <motion.div
                key="gm-alert"
                role="alert"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute bottom-2 right-2 z-20 flex max-w-[230px] items-center gap-2.5 rounded-lg border border-signal-400/30 bg-[#0e0e16]/95 px-3 py-2 shadow-[0_0_0_1px_rgba(45,212,191,0.08),0_12px_30px_-14px_rgba(0,0,0,0.7)] backdrop-blur-sm"
              >
                <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-signal-500/12 ring-1 ring-signal-400/30">
                  <Sparkles className="size-3.5 text-signal-300" />
                  {!reduce && (
                    <span className="absolute inset-0 rounded-full ring-1 ring-signal-400/40 motion-safe:animate-ping" />
                  )}
                </span>
                <p className="text-[11px] leading-snug text-white/80">
                  Use Pro or Scale to unlock the tools and keep scaling.
                </p>
                <Link
                  href="/app/checkout?plan=pro&interval=month"
                  className="shrink-0 rounded-md bg-signal-400 px-2 py-1 text-[10.5px] font-semibold text-[#06060a] inline-flex items-center gap-0.5"
                >
                  Unlock
                  <ArrowRight className="size-3" />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-2 text-center text-[11px] text-white/40">
          Hover, tap or focus any rank to read its store-specific feedback.
        </p>

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
          />
        </div>
      </Card>
    </motion.div>
  );
}
