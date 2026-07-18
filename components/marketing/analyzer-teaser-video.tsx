"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Real teaser video of the analyzer, shown as the hero visual.
 *
 * Behavior:
 *   • Click-to-play WITH sound — no autoplay. The poster (a real frame of
 *     the analyzer) + a play button carry the visual until the visitor
 *     opts in, which also makes unmuted playback reliable in every
 *     browser (user-gesture requirement) and inherently respects
 *     prefers-reduced-motion.
 *   • preload="metadata" only — a few KB up front; the stream starts on
 *     click, so the video never competes with the page's LCP.
 *   • Native controls appear once playing (pause / seek / volume); when
 *     the teaser ends it resets back to the poster + play button.
 *   • playsInline keeps iOS embedded; the 1080×512 aspect ratio is
 *     reserved up front so there's no layout shift.
 *
 * The video file is pre-cropped: the screen recording's browser URL bar
 * is cut off because this component draws its own chrome bar on top.
 */

const VIDEO_WEBM = "/videos/analyzer-teaser.webm";
const VIDEO_MP4 = "/videos/analyzer-teaser.mp4";
const POSTER = "/videos/analyzer-teaser-poster.jpg";

export function AnalyzerTeaserVideo() {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const start = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
  };

  const reset = () => {
    const video = videoRef.current;
    setStarted(false);
    if (video) video.currentTime = 0;
  };

  return (
    <div className="relative">
      {/* Teaser title — invitation above the panel */}
      <div className="mb-5 flex items-center justify-center gap-2.5 text-[11px] font-mono uppercase tracking-widest text-white/45">
        <span className="grid size-5 place-items-center rounded-full bg-signal-600/15 ring-1 ring-signal-500/25">
          <Play className="size-2.5 translate-x-px text-signal-300" fill="currentColor" />
        </span>
        {t("hero.teaserTitle")}
      </div>

      {/* Ambient glow — teal (signal) is the AI/data accent for this surface */}
      <div className="absolute -inset-4 top-6 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl pointer-events-none" />

      <div className="relative glass-strong rounded-2xl overflow-hidden shadow-2xl">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-obsidian-900/60">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
            <span className="size-2.5 rounded-full bg-white/10" />
          </div>
          <div className="ml-3 flex-1 rounded-md bg-white/[0.04] px-3 py-1 text-xs text-white/40 font-mono">
            elitevaultapp.com/app/analyzer
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-widest">
            <span className="size-1.5 rounded-full bg-success animate-pulse motion-reduce:animate-none" />
            Live demo
          </div>
        </div>

        {/* aspect matches the encoded video (1080×512) exactly */}
        <div className="relative aspect-[1080/512] bg-obsidian-900">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full"
            controls={started}
            playsInline
            preload="metadata"
            poster={POSTER}
            aria-label={t("analyzerDemo.videoAria")}
            onPlay={() => setStarted(true)}
            onEnded={reset}
          >
            <source src={VIDEO_WEBM} type="video/webm" />
            <source src={VIDEO_MP4} type="video/mp4" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={POSTER} alt={t("analyzerDemo.videoAria")} />
          </video>

          {!started && (
            <button
              type="button"
              onClick={start}
              aria-label={t("analyzerDemo.videoPlay")}
              className="group absolute inset-0 grid place-items-center bg-obsidian-950/30 transition-colors hover:bg-obsidian-950/15"
            >
              <span className="flex flex-col items-center gap-3">
                <span className="flex size-16 items-center justify-center rounded-full bg-obsidian-950/70 ring-1 ring-white/20 backdrop-blur-sm transition-transform group-hover:scale-105">
                  <Play className="size-6 translate-x-0.5 text-white" fill="currentColor" />
                </span>
                <span className="rounded-full bg-obsidian-950/60 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm">
                  {t("hero.teaserDuration")}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
