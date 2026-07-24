"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Flame,
  ExternalLink,
  Lock,
  Sparkles,
  ArrowRight,
  Radio,
  Megaphone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCompact } from "@/lib/utils";
import type { NicheWinner } from "@/lib/library/niche-winners";

/**
 * "🔥 Winners in your niche — live" (FASE B).
 *
 * Sits at the top of the analyzer's right column — the first horizontal sweep
 * of the F-pattern, so it reads as one of the first things on the page without
 * displacing the score, which is the direct answer to "how is my store doing?".
 * On mobile it stacks right after the score, never at the bottom.
 *
 * Shows the 3 most active winning stores in the analyzed store's niche, all
 * from precomputed Library data (see lib/library/niche-winners.ts).
 *
 * Row value order is deliberate: the URL and "see their active ads" come
 * FIRST, because "who's winning and what can I copy" is the job the media
 * buyer hired this module for. Revenue is a supporting signal, always a range,
 * always labelled "est.".
 *
 * Free viewers get one REAL winner plus locked rows — the aha is previewed,
 * not paywalled. The locked rows' data never reaches this client: the server
 * sends one row and a count.
 */

/** True only for a real, finite, positive number — no NaN, no "undefined". */
function usable(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function AdsBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success ring-1 ring-success/20">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-success" />
      </span>
      {n} active ads
    </span>
  );
}

function RevenueSignal({ low, high }: { low: number; high: number }) {
  return (
    <span className="font-mono text-[10px] tabular-nums text-signal-300">
      ~${formatCompact(low)}–{formatCompact(high)}/mo est.
    </span>
  );
}

function WinnerRow({ w }: { w: NicheWinner }) {
  // Rows arrive from Library data that can be partially seeded. Anything we
  // can't state honestly is hidden, never rendered as "undefined"/"NaN".
  const title = w.title?.trim() || w.domain;
  const showAds = usable(w.activeAds);
  const showRevenue = usable(w.revenue?.low) && usable(w.revenue?.high);
  const showMatch = usable(w.matchPct);

  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 transition-colors hover:border-signal-500/20 hover:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        {/* Favicon (public favicon service — no data leaves with it). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={w.faviconUrl}
          alt=""
          aria-hidden
          width={20}
          height={20}
          loading="lazy"
          className="mt-0.5 size-5 shrink-0 rounded"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a
              href={w.url}
              target="_blank"
              rel="noopener nofollow"
              className="truncate text-sm font-medium text-white transition-colors hover:text-signal-200"
            >
              {title}
            </a>
            <ExternalLink className="size-3 shrink-0 text-white/30" />
          </div>
          {/* Momentum + revenue signals */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {showAds && <AdsBadge n={w.activeAds as number} />}
            {showRevenue && w.revenue && (
              <RevenueSignal low={w.revenue.low} high={w.revenue.high} />
            )}
          </div>
          {/* Niche match — how literally to take the comparison. */}
          <p className="mt-1.5 text-[10px] uppercase tracking-wider text-white/35">
            {w.nicheLabel}
            {showMatch && (
              <>
                {" · "}
                <span
                  className={
                    w.exactMatch ? "text-champagne-300/80" : "text-white/45"
                  }
                >
                  {w.matchPct}% match
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/*
        The strongest hook in the module: the buyer wants the CREATIVES that
        are running, not a number. Deep-links into the public Meta Ad Library.
      */}
      {w.adsUrl && (
        <a
          href={w.adsUrl}
          target="_blank"
          rel="noopener nofollow"
          className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg border border-champagne-400/20 bg-champagne-400/[0.06] px-2.5 py-1.5 text-[11px] font-medium text-champagne-200 transition-colors hover:border-champagne-400/35 hover:bg-champagne-400/[0.1]"
        >
          <Megaphone className="size-3" />
          See their active ads
          <ArrowRight className="size-3" />
        </a>
      )}
    </div>
  );
}

/** One blurred, non-identifying skeleton row for the Free (locked) teaser. */
function GhostRow() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
      <div className="mt-0.5 size-5 shrink-0 rounded bg-white/10" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-2/3 rounded bg-white/10" />
        <div className="flex gap-2">
          <div className="h-3 w-20 rounded-full bg-success/20" />
          <div className="h-3 w-16 rounded bg-signal-500/20" />
        </div>
        <div className="h-2 w-1/2 rounded bg-white/[0.07]" />
      </div>
    </div>
  );
}

function Header({
  nicheLabel,
  scope,
}: {
  nicheLabel: string;
  scope: "niche" | "global";
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-champagne-300" />
          {/* Never claim a niche match we don't have — when the store couldn't
              be classified these are the Library's top performers, full stop. */}
          <h3 className="font-medium text-white">
            {scope === "niche" ? "Winners in your niche" : "Top converting stores"}
          </h3>
        </div>
        <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-success">
          <Radio className="size-3" />
          Live · most active right now
        </p>
      </div>
      <Badge variant="default" className="shrink-0">
        {nicheLabel?.trim() || "Your niche"}
      </Badge>
    </div>
  );
}

/**
 * The Free upsell, shown UNDER the one real winner and over the blurred rest.
 * In-context: it appears at the moment the user has just seen that the data is
 * real, which is where an upgrade prompt actually converts.
 */
function LockedRows({ count }: { count: number }) {
  const rows = usable(count) ? Math.min(3, Math.round(count)) : 2;
  return (
    <div className="relative mt-2">
      <div
        aria-hidden
        className="pointer-events-none select-none space-y-2 opacity-70 blur-[5px] filter"
      >
        {Array.from({ length: rows }).map((_, i) => (
          <GhostRow key={i} />
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center px-4 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-champagne-400/15 ring-2 ring-champagne-400/30 backdrop-blur-sm">
            <Lock className="size-4 text-champagne-300" />
          </div>
          <p className="mt-2.5 text-sm font-medium text-white">
            Unlock all {rows + 1} winners
          </p>
          <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-white/55">
            See every store outspending you right now — and the exact ads
            they&apos;re running.
          </p>
          <Link href="/app/checkout?plan=pro&interval=month" className="mt-3">
            <Button variant="primary" size="sm">
              <Sparkles className="size-3.5" />
              Go Pro
              <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NicheWinners({
  nicheLabel = "Your niche",
  winners = [],
  locked = false,
  lockedCount = 0,
  scope = "niche",
}: {
  nicheLabel: string;
  winners?: NicheWinner[];
  locked?: boolean;
  lockedCount?: number;
  scope?: "niche" | "global";
}) {
  // Drop anything unrenderable BEFORE deciding whether the card exists, so a
  // list of half-seeded rows hides the module instead of showing empty ones.
  const rows = (Array.isArray(winners) ? winners : []).filter(
    (w) => w && typeof w.domain === "string" && w.domain.trim().length > 0,
  );

  // Nothing real to show → render nothing. A lock overlay floating over pure
  // skeletons is a worse experience than no module at all, and the server
  // already hides this case.
  if (rows.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden p-5 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.04] to-signal-600/[0.03]">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-champagne-400/12 blur-3xl" />

        <div className="relative">
          <Header nicheLabel={nicheLabel} scope={scope} />

          {/* Real winners: all 3 on Pro/Scale, the top 1 on Free. */}
          <div className="space-y-2">
            {rows.map((w) => (
              <WinnerRow key={w.domain} w={w} />
            ))}
          </div>

          {locked && lockedCount > 0 && <LockedRows count={lockedCount} />}

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[10px] leading-snug text-white/35">
              Estimated from public signals. Not figures reported by the brands.
            </p>
            <Link
              href="/app/library"
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-signal-300 transition-colors hover:text-signal-200"
            >
              Library
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
