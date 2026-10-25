"use client";

import { Play } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";
import { TeaserFrame } from "./teaser-frame";
import { TeaserMoreDemos } from "./teaser-more-demos";
import { MAIN_TEASER } from "./teasers";

/**
 * Real teaser video of the analyzer, shown as the hero visual.
 *
 * The player itself (chrome + click-to-play video) lives in TeaserFrame so the
 * "More demos" modal can reuse the exact same look. This component keeps the
 * hero-only dressing: the invitation title above, the ambient glow, and — only
 * when a secondary teaser is marked `ready` in teasers.ts — the mini-teaser row
 * underneath. With none ready, the DOM is the single-teaser hero as before.
 *
 * Behavior of the main player (unchanged):
 *   • Click-to-play WITH sound — no autoplay; preload="metadata" keeps the
 *     poster paint cheap and the stream starts on click, so the video never
 *     competes with the page's LCP.
 *   • The video file is pre-cropped: the screen recording's browser URL bar is
 *     cut off because the frame draws its own chrome bar on top.
 */
export function AnalyzerTeaserVideo() {
  const { t } = useT();

  return (
    <div className="relative">
      {/* Teaser title — invitation above the panel */}
      <div className="mb-5 flex items-center justify-center gap-2.5 text-xs font-mono uppercase tracking-widest text-white/45">
        <span className="grid size-5 place-items-center rounded-full bg-signal-600/15 ring-1 ring-signal-500/25">
          <Play className="size-2.5 translate-x-px text-signal-300" fill="currentColor" />
        </span>
        {t("hero.teaserTitle")}
      </div>

      {/* Ambient glow — teal (signal) is the AI/data accent for this surface */}
      <div className="absolute -inset-4 top-6 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl pointer-events-none" />

      <TeaserFrame
        teaser={MAIN_TEASER}
        ariaLabel={t("teasers.mainVideoAria")}
        playLabel={t("teasers.mainVideoPlay")}
        durationLabel={t("hero.teaserDuration")}
        preload="metadata"
      />

      <TeaserMoreDemos />
    </div>
  );
}
