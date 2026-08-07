"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/supabase/types";
import { computePlacement } from "@/lib/growth-map/placement";
import { scaffoldNodes, scaffoldDiagnosis } from "@/lib/growth-map/phrase-bank";
import { resolveNicheLabel } from "@/lib/growth-map/niche";
import { rankByIndex, RANKS } from "@/lib/growth-map/ranks";
import { gateForViewer } from "@/lib/growth-map/gate";
import type { GrowthMapData } from "@/lib/growth-map/types";
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
            {/* §1.3 — reads the map honestly: readiness, not revenue. */}
            <p className="mt-1.5 text-[11.5px] leading-snug text-white/45 max-w-[52ch]">
              This maps how far your store&apos;s conversion readiness can carry
              it — not your current revenue.
            </p>
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
              {/* §1.2 — re-run movement: how far this store moved since last time. */}
              {movement && (
                <Badge
                  variant="default"
                  className="font-mono tnum border-signal-400/40 text-signal-200"
                >
                  {movement.previousComposite} → {movement.currentComposite}
                  {movement.crossedWall
                    ? " · crossed The Wall"
                    : movement.currentRankIndex > movement.previousRankIndex
                      ? " · advanced"
                      : ""}
                </Badge>
              )}
            </div>
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
                  onClick={() => setOpenIndex((p) => (p === i ? null : i))}
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
              <AnimatePresence mode="wait" initial={false}>
                {openNode ? (
                  <motion.div
                    key={openIndex}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                  >
                    <NodeCard node={openNode} />
                  </motion.div>
                ) : (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="text-center text-[11.5px] text-white/40"
                  >
                    Hover, tap or focus any rank to read its store-specific
                    feedback.
                  </motion.p>
                )}
              </AnimatePresence>
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
              <span className="text-white/75">
                Apply these fixes, then re-run the analyzer to advance.
              </span>
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
