"use client";

import { useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageOff, Layers, Maximize2, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/lib/supabase/types";

/**
 * Severity → solid pin color. high=red, medium=orange, low=green.
 * (Matches the brand: no gold anywhere — medium is orange, not amber.)
 */
const COLOR: Record<Annotation["severity"], string> = {
  high: "#EF4444",
  medium: "#FB923C",
  low: "#22C55E",
};

const SEV_LABEL: Record<Annotation["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Renders the captured screenshot with a PROFESSIONAL annotation layer on top
 * — the kind of report you'd get from Hotjar / Crazy Egg / MS Clarity:
 *
 *   • Numbered "pin" markers — fixed-size, perfectly circular HTML elements
 *     positioned in % (NOT shapes inside an `preserveAspectRatio="none"` SVG,
 *     which deformed them into ellipses).
 *   • Spotlight / focus dimming — hover or activate a finding and the rest of
 *     the screenshot dims while the issue's region gets a soft severity halo.
 *   • A leader line + side callout card (number · title · severity chip · Fix)
 *     anchored to the active pin.
 *   • A findings rail (below) that is fully synced both ways with the pins.
 *
 * This is presentation only — the `Annotation` data shape
 * (`x, y, width, height, severity, type, message, fix`) is untouched; we just
 * draw what the backend already returns, so it works on any AI plan/model.
 *
 * Coordinates IDEALLY come normalized 0..1, but the model sometimes returns
 * pixel-scale values; `normalizeCoords` detects and rescales either way.
 */
function normalizeCoords(annotations: Annotation[]): Annotation[] {
  if (annotations.length === 0) return annotations;
  let max = 0;
  for (const a of annotations) {
    max = Math.max(max, a.x, a.y, a.width ?? 0, a.height ?? 0);
  }
  if (max <= 1.5) return annotations;
  const divisor = max * 1.02;
  return annotations.map((a) => ({
    ...a,
    x: a.x / divisor,
    y: a.y / divisor,
    width: a.width != null ? a.width / divisor : undefined,
    height: a.height != null ? a.height / divisor : undefined,
  }));
}

export function AnnotationsOverlay({
  imageUrl,
  annotations: raw,
}: {
  imageUrl: string;
  annotations: Annotation[];
}) {
  const annotations = normalizeCoords(raw);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [imgErrored, setImgErrored] = useState(false);
  const hasImage = !!imageUrl && !imgErrored;

  // The finding currently in focus: an explicit click wins over a hover.
  const focusIdx = activeIdx ?? hoverIdx;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Annotated audit</h3>
          <span className="text-xs text-white/40">
            {annotations.length} {annotations.length === 1 ? "issue" : "issues"} found
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-white/40">
          <span className="hidden sm:flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-destructive" />
            High
          </span>
          <span className="hidden sm:flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-warning" />
            Medium
          </span>
          <span className="hidden sm:flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-success" />
            Low / good
          </span>
          {hasImage && (
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border border-white/[0.08] px-2 py-1 text-white/55 hover:text-white hover:border-white/20 transition-colors"
            >
              <Maximize2 className="size-3" />
              Full image
            </a>
          )}
        </div>
      </div>

      <div className="px-5 py-2.5 border-b border-white/[0.04] bg-champagne-400/[0.025] flex items-center gap-2">
        <Layers className="size-3 text-champagne-300" />
        <p className="text-[11px] text-white/65 leading-tight">
          <span className="text-white">First-impression view</span>
          <span className="text-white/40"> · This screenshot shows the
          above-the-fold capture. The audit findings below also analyzed
          the full page text — reviews, trust badges, FAQ, descriptions
          and CTAs from the entire URL.</span>
        </p>
      </div>

      <div className="relative bg-obsidian-950 select-none">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Audit screenshot"
            className="block w-full h-auto"
            style={{ touchAction: "pinch-zoom" }}
            onError={() => setImgErrored(true)}
          />
        ) : (
          <div className="aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-obsidian-800/40 to-obsidian-900/60 border-b border-white/[0.04]">
            <div className="flex size-12 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <ImageOff className="size-5 text-white/40" />
            </div>
            <p className="mt-4 text-sm font-medium text-white/70">
              Screenshot couldn&apos;t be captured
            </p>
            <p className="mt-1.5 text-xs text-white/40 max-w-sm text-center leading-relaxed">
              The site likely blocks automated capture (Cloudflare, anti-bot)
              or renders too slowly. The audit findings below are still based
              on what the AI saw at the time of the run.
            </p>
          </div>
        )}

        {/* ── Spotlight: dim everything but the focused issue's region ── */}
        {hasImage && (
          <AnimatePresence>
            {focusIdx != null &&
              (() => {
                const a = annotations[focusIdx];
                const w = a.width ?? 0.16;
                const h = a.height ?? 0.11;
                const c = COLOR[a.severity];
                return (
                  <motion.div
                    key={`spot-${focusIdx}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="absolute z-10 rounded-lg pointer-events-none"
                    style={{
                      left: `${(a.x - w / 2) * 100}%`,
                      top: `${(a.y - h / 2) * 100}%`,
                      width: `${w * 100}%`,
                      height: `${h * 100}%`,
                      border: `1.5px solid ${c}`,
                      boxShadow: `0 0 0 9999px rgba(6,6,10,0.62), 0 0 22px -2px ${c}`,
                    }}
                  />
                );
              })()}
          </AnimatePresence>
        )}

        {/* ── Numbered pins (HTML, perfectly circular, fixed size) ── */}
        {hasImage &&
          annotations.map((a, i) => {
            const c = COLOR[a.severity];
            const isFocus = focusIdx === i;
            const dim = focusIdx != null && !isFocus;
            return (
              <motion.button
                key={i}
                type="button"
                initial={{ opacity: 0, y: 6, scale: 0.8 }}
                animate={{ opacity: dim ? 0.45 : 1, y: 0, scale: 1 }}
                transition={{
                  delay: 0.15 + i * 0.05,
                  duration: 0.35,
                  ease: [0.22, 1, 0.36, 1],
                }}
                onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full text-[11px] font-semibold text-white transition-transform"
                style={{
                  left: `${a.x * 100}%`,
                  top: `${a.y * 100}%`,
                  width: 28,
                  height: 28,
                  background: c,
                  border: "2px solid rgba(255,255,255,0.92)",
                  boxShadow: isFocus
                    ? `0 0 0 4px ${c}55, 0 4px 14px -2px rgba(0,0,0,0.6)`
                    : "0 2px 8px -1px rgba(0,0,0,0.55)",
                  transform: `translate(-50%, -50%) scale(${isFocus ? 1.18 : 1})`,
                }}
                aria-label={`Issue ${i + 1}: ${a.message}`}
              >
                {i + 1}
              </motion.button>
            );
          })}

        {/* ── Leader line + callout card for the focused finding (sm+) ── */}
        {hasImage && (
          <AnimatePresence>
            {focusIdx != null &&
              (() => {
                const a = annotations[focusIdx];
                const c = COLOR[a.severity];
                const side: "left" | "right" = a.x > 0.52 ? "left" : "right";
                const vy = a.y * 100;
                const vAlign = vy < 26 ? "-12%" : vy > 74 ? "-88%" : "-50%";
                const at = (offset: number): CSSProperties =>
                  side === "right" ? { left: offset } : { right: offset };
                return (
                  <motion.div
                    key={`callout-${focusIdx}`}
                    initial={{ opacity: 0, x: side === "right" ? -6 : 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: side === "right" ? -6 : 6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute z-30 hidden sm:block pointer-events-none"
                    style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                  >
                    {/* leader line — a thin connector from the pin to the card */}
                    <span
                      className="absolute top-0 h-px"
                      style={{
                        ...at(14),
                        width: 30,
                        background: c,
                        transform: "translateY(-0.5px)",
                      }}
                    />
                    <span
                      className="absolute top-0 size-1.5 rounded-full"
                      style={{
                        ...at(42),
                        background: c,
                        transform: "translate(-50%,-50%)",
                      }}
                    />
                    {/* callout card */}
                    <div
                      className="glass-strong absolute w-[230px] rounded-xl p-3 shadow-2xl"
                      style={{
                        ...at(46),
                        top: 0,
                        transform: `translateY(${vAlign})`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="grid size-5 place-items-center rounded-full text-[10px] font-semibold text-white"
                          style={{ background: c }}
                        >
                          {focusIdx + 1}
                        </span>
                        <Badge
                          variant={
                            a.severity === "high"
                              ? "danger"
                              : a.severity === "medium"
                                ? "warning"
                                : "success"
                          }
                        >
                          {SEV_LABEL[a.severity]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[12px] font-medium text-white leading-snug">
                        {a.message}
                      </p>
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/[0.03] px-2 py-1.5">
                        <Wrench className="mt-0.5 size-3 shrink-0 text-champagne-300" />
                        <p className="text-[11px] text-white/65 leading-relaxed">
                          {a.fix}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
          </AnimatePresence>
        )}
      </div>

      {/* ── Findings rail — synced both ways with the pins ── */}
      <div className="border-t border-white/[0.04] divide-y divide-white/[0.04]">
        {annotations.map((a, i) => {
          const isOpen = activeIdx === i;
          const isFocus = focusIdx === i;
          return (
            <motion.button
              key={i}
              layout
              onClick={() => setActiveIdx(isOpen ? null : i)}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className={cn(
                "w-full text-left px-5 py-3 flex items-start gap-3 transition-colors",
                isFocus ? "bg-white/[0.04]" : "hover:bg-white/[0.02]",
              )}
            >
              <span
                className="shrink-0 grid size-5 place-items-center rounded-full text-[10px] font-semibold text-white transition-transform"
                style={{
                  background: COLOR[a.severity],
                  transform: `scale(${isFocus ? 1.12 : 1})`,
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white font-medium">{a.message}</p>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-1.5 text-xs text-white/55 leading-relaxed overflow-hidden"
                    >
                      <span className="text-champagne-400 font-medium">Fix:</span>{" "}
                      {a.fix}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <Badge
                variant={
                  a.severity === "high"
                    ? "danger"
                    : a.severity === "medium"
                      ? "warning"
                      : "success"
                }
              >
                {a.severity}
              </Badge>
            </motion.button>
          );
        })}
      </div>
    </Card>
  );
}
