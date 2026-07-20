"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, ExternalLink, Info, Lock, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveButton } from "./save-button";
import { cn, formatCompact } from "@/lib/utils";
import type { WinningSiteCard } from "@/app/actions/search";

/**
 * Resolve what a card should actually load, if anything.
 *
 * Two cases, both of which used to render a dead grey box:
 *
 *  1. LEGACY mshots URLs. Rows we couldn't snapshot (the store bot-blocks our
 *     capture) still point at s.wordpress.com/mshots, which renders on demand
 *     and answers a cold cache with a BLANK placeholder — served as HTTP 200,
 *     so `onError` never fires and the fallback never shows. Return null and
 *     go straight to the branded tile: an honest tile beats a blank image.
 *
 *  2. Our own snapshots are full-page captures (~2880x20000, 1-4MB) while the
 *     card is a ~400px 4:3 window — 53 of them was ~124MB of page weight.
 *     Supabase's render endpoint resizes on the fly: at width=800 the same
 *     shot drops 1173KB -> 141KB (-88%) for free, no re-capture. Aspect ratio
 *     is preserved (still tall), so `object-top` below still frames the hero.
 */
function thumbSrc(url: string | null | undefined): string | null {
  if (!url || url.includes("s.wordpress.com/mshots")) return null;
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, "/storage/v1/render/image/public/")}?width=800&quality=70`;
}

export function SiteCard({
  site,
  index = 0,
  canSave = false,
  initialSaved = false,
}: {
  site: WinningSiteCard;
  index?: number;
  /** Whether to show the ★ save button (Pro+). */
  canSave?: boolean;
  initialSaved?: boolean;
}) {
  const m = site.metrics as {
    ctr?: number;
    roi?: number;
    conv_rate?: number;
    traffic_est?: number;
  };
  const ad = site.ad_signals as
    | { active_ads?: number; activity_score?: number; estimated?: boolean }
    | null
    | undefined;
  const locked = !!site.metrics_locked;
  const [imgFailed, setImgFailed] = useState(false);
  const src = thumbSrc(site.thumbnail_url);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.4),
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card/40 transition-all",
        locked
          ? "border-white/[0.04] hover:border-champagne-400/20"
          : "border-white/[0.06] hover:border-white/[0.14]",
      )}
    >
      {site.ai_reason && (
        <div className="absolute top-3 left-3 z-10 max-w-[80%]">
          <Badge variant="ai">
            <Sparkles className="size-3" />
            {site.ai_reason.slice(0, 80)}
          </Badge>
        </div>
      )}

      <div className="relative aspect-[4/3] overflow-hidden bg-obsidian-900">
        {imgFailed || !src ? (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-obsidian-800 to-obsidian-900">
            <div className="absolute inset-0 bg-dot-grid opacity-20" />
            <span className="relative font-serif text-4xl text-white/25">
              {site.domain.replace(/^www\./, "").charAt(0).toUpperCase()}
            </span>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={site.title}
            onError={() => setImgFailed(true)}
            className={cn(
              // object-TOP, not the browser default (center): thumbnails are
              // full-page captures, often 2880x20000 (ratio ~7), so centering
              // crops this 4:3 window to a random slice of the page's middle —
              // usually a footer or a product grid. The top is the hero, which
              // is what identifies the store at a glance.
              "absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105",
              locked && "grayscale-[40%]",
            )}
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian-950/80 via-obsidian-950/20 to-transparent" />
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {site.is_featured && (
            <Badge
              variant="gold"
              className="border-champagne-400/40 bg-obsidian-950/70 shadow-card"
            >
              Featured
            </Badge>
          )}
          {ad?.estimated && ad.activity_score !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Badge variant="ai">
                    <Activity className="size-3" />
                    {ad.activity_score}/100
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px]">
                <p className="font-medium">Ad Activity Score</p>
                <p className="mt-1 text-white/60">
                  Estimated from public Meta Ad Library signals (active ads,
                  longevity, region count). Higher = currently spending hard.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-medium text-white truncate">{site.title}</h3>
            <p className="text-xs text-white/40 truncate">{site.domain}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canSave && (
              <SaveButton siteId={site.id} initialSaved={initialSaved} />
            )}
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="size-7 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {(
            [
              ["CTR", m.ctr ? `${m.ctr.toFixed(1)}%` : "—", false],
              ["ROI", m.roi ? `${m.roi.toFixed(1)}x` : "—", false],
              // Conversion is the number an operator will challenge first —
              // flag it explicitly as an estimate with an accessible tooltip
              // explaining the source. We don't have anyone's Shopify data.
              ["Est. conv.", m.conv_rate ? `${m.conv_rate.toFixed(1)}%` : "—", true],
              ["Traffic", m.traffic_est ? formatCompact(m.traffic_est) : "—", false],
            ] as const
          ).map(([label, val, withTip]) => (
            <div
              key={label}
              className={cn(
                "rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-center",
                locked && "select-none",
              )}
            >
              {withTip && !locked ? (
                <Tooltip>
                  <TooltipTrigger
                    aria-label="Estimated conversion rate — modeled from public signals, not brand-reported."
                    className="mx-auto flex items-center justify-center gap-0.5 rounded text-white/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest">
                      {label}
                    </span>
                    <Info className="size-2.5" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-left">
                    Estimated from public traffic &amp; behavior signals — not an
                    official figure reported by the brand.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-widest text-white/40",
                    locked && "blur-[3px]",
                  )}
                >
                  {label}
                </p>
              )}
              <p
                className={cn(
                  "mt-0.5 text-xs font-medium text-white num",
                  locked && "blur-[3px]",
                )}
              >
                {val}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-white/40">
          <TrendingUp className="size-3" />
          <span className="capitalize">{site.niche}</span>
        </div>
      </div>

      {locked && (
        <div className="absolute inset-0 grid place-items-center bg-obsidian-950/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2 rounded-lg bg-obsidian-900/95 px-4 py-2 ring-1 ring-champagne-400/30 shadow-gold">
            <Lock className="size-3.5 text-champagne-400" />
            <span className="text-xs text-white">Unlock metrics with Pro</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
