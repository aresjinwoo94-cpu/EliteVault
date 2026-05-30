"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ImageOff, Layers, Maximize2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/lib/supabase/types";

const COLOR: Record<Annotation["severity"], string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#10B981",
};

const RING_COLOR: Record<Annotation["severity"], string> = {
  high: "ring-destructive/40",
  medium: "ring-warning/40",
  low: "ring-success/40",
};

/**
 * Renders the captured screenshot with SVG annotations placed on top.
 *
 * Coordinates IDEALLY come normalized 0..1 (per system prompt), but
 * Gemini Flash-Lite sometimes returns pixel-scale values regardless.
 * `normalizeCoords` below detects which we got and rescales accordingly —
 * the overlay aligns properly either way.
 */
function normalizeCoords(annotations: Annotation[]): Annotation[] {
  if (annotations.length === 0) return annotations;
  // Find the max value across all coord fields. If max > 1.5 we assume
  // pixel-scale and divide by it (with a tiny margin so things don't sit
  // right at the edge).
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
  // Track image loading state so we can show a clean unavailable card
  // (vs. a broken-image icon) when the server returned no screenshot.
  const [imgErrored, setImgErrored] = useState(false);
  const hasImage = !!imageUrl && !imgErrored;

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
          {/* P2.3 — mobile zoom: open the raw screenshot full-screen so
              TikTok/Reels traffic can pinch-zoom it natively. */}
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

      {/*
        v3.9.3 — explicit scope clarification so users don't think the
        annotations on a single viewport screenshot are the whole audit.
        The agent receives the screenshot AS WELL AS the full page text
        (headings, reviews, trust badges, FAQ, CTAs, body excerpt) — see
        lib/site-discovery.ts + ai/prompts.ts (FULL-PAGE CONTENT block).
        The audit findings reference content from BOTH layers.
      */}
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

      <div className="relative bg-obsidian-950">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Audit screenshot"
            className="block w-full h-auto"
            // P2.3 — allow native pinch-zoom on touch devices.
            style={{ touchAction: "pinch-zoom" }}
            onError={() => setImgErrored(true)}
          />
        ) : (
          // Clean unavailable state. We deliberately do NOT fall back to
          // any client-side screenshot service here — the server already
          // tried everything (ScreenshotOne → Microlink → mshots with
          // placeholder detection). If we got here without an image, the
          // site is genuinely uncapturable (Cloudflare wall, JS-only, etc).
          // The annotations from the AI are still meaningful for the user
          // (it analyzed the captured shot during the audit), they just
          // can't be rendered in this overlay.
          <div className="aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-obsidian-800/40 to-obsidian-900/60 border-b border-white/[0.04]">
            <div className="flex size-12 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
              <ImageOff className="size-5 text-white/40" />
            </div>
            <p className="mt-4 text-sm font-medium text-white/70">
              Screenshot couldn't be captured
            </p>
            <p className="mt-1.5 text-xs text-white/40 max-w-sm text-center leading-relaxed">
              The site likely blocks automated capture (Cloudflare, anti-bot)
              or renders too slowly. The audit findings below are still based
              on what the AI saw at the time of the run.
            </p>
          </div>
        )}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={cn(
            "absolute inset-0 w-full h-full pointer-events-none",
            !hasImage && "hidden",
          )}
        >
          <defs>
            {(["high", "medium", "low"] as const).map((sev) => (
              <marker
                key={sev}
                id={`arrow-${sev}`}
                markerWidth="4"
                markerHeight="4"
                refX="3"
                refY="2"
                orient="auto"
              >
                <path d="M0,0 L0,4 L4,2 z" fill={COLOR[sev]} />
              </marker>
            ))}
          </defs>

          {annotations.map((a, i) => {
            const x = a.x * 100;
            const y = a.y * 100;
            const w = (a.width ?? 0.06) * 100;
            const h = (a.height ?? 0.06) * 100;
            const c = COLOR[a.severity];

            if (a.type === "circle") {
              return (
                <motion.ellipse
                  key={i}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.06 }}
                  cx={x}
                  cy={y}
                  rx={w / 2}
                  ry={h / 2}
                  fill={c}
                  fillOpacity={activeIdx === i ? 0.18 : 0.06}
                  stroke={c}
                  strokeWidth="0.5"
                />
              );
            }
            if (a.type === "highlight") {
              return (
                <motion.rect
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  x={x - w / 2}
                  y={y - h / 2}
                  width={w}
                  height={h}
                  rx="1"
                  fill={c}
                  fillOpacity="0.12"
                  stroke={c}
                  strokeWidth="0.3"
                  strokeDasharray="1 1"
                />
              );
            }
            if (a.type === "cross") {
              return (
                <motion.g
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  stroke={c}
                  strokeWidth="0.7"
                >
                  <line x1={x - 2.4} y1={y - 2.4} x2={x + 2.4} y2={y + 2.4} />
                  <line x1={x - 2.4} y1={y + 2.4} x2={x + 2.4} y2={y - 2.4} />
                </motion.g>
              );
            }
            if (a.type === "arrow") {
              return (
                <motion.line
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  x1={Math.max(0, x - 8)}
                  y1={Math.max(0, y - 8)}
                  x2={x}
                  y2={y}
                  stroke={c}
                  strokeWidth="0.5"
                  markerEnd={`url(#arrow-${a.severity})`}
                />
              );
            }
            return null;
          })}
        </svg>

        {/* clickable hotspots — only when we have an image to anchor to */}
        {hasImage &&
          annotations.map((a, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(activeIdx === i ? null : i)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full ring-2 transition-all",
                "size-6 text-[10px] font-medium bg-obsidian-900/90 backdrop-blur text-white",
                RING_COLOR[a.severity],
                activeIdx === i
                  ? "scale-125 shadow-[0_0_20px_-4px_rgba(255,255,255,0.4)]"
                  : "hover:scale-110",
              )}
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
            >
              {i + 1}
            </button>
          ))}
      </div>

      {/* annotations list */}
      <div className="border-t border-white/[0.04] divide-y divide-white/[0.04]">
        {annotations.map((a, i) => {
          const isOpen = activeIdx === i;
          return (
            <motion.button
              key={i}
              layout
              onClick={() => setActiveIdx(isOpen ? null : i)}
              className={cn(
                "w-full text-left px-5 py-3 flex items-start gap-3 transition-colors",
                isOpen ? "bg-white/[0.03]" : "hover:bg-white/[0.02]",
              )}
            >
              <span
                className={cn(
                  "shrink-0 size-5 rounded-full text-[10px] font-medium text-white flex items-center justify-center",
                )}
                style={{ background: COLOR[a.severity] }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white font-medium">{a.message}</p>
                {isOpen && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-1.5 text-xs text-white/55 leading-relaxed"
                  >
                    <span className="text-champagne-400 font-medium">Fix:</span>{" "}
                    {a.fix}
                  </motion.p>
                )}
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
