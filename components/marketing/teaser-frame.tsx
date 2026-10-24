"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";
import { phCapture } from "@/lib/analytics/posthog";
import type { Teaser } from "./teasers";

/**
 * The shared teaser player: browser-chrome bar + 1080×512 video + click-to-play
 * overlay. Extracted from AnalyzerTeaserVideo so the hero's main teaser and the
 * "More demos" modal render exactly the same frame.
 *
 * Behavior (unchanged from the original hero player):
 *   • Click-to-play WITH sound — the poster + a play button carry the visual
 *     until the visitor opts in (user gesture ⇒ reliable unmuted playback).
 *   • Native controls appear once playing; when the video ends it resets to the
 *     poster + play button.
 *   • The aspect ratio is reserved up front, so there is no layout shift.
 *
 * `autoPlay` is for the modal only: the visitor already clicked a card, so the
 * click is the gesture. The video element is unmounted with the dialog, which
 * is what pauses it and rewinds it to 0 on close.
 */
export function TeaserFrame({
  teaser,
  ariaLabel,
  playLabel,
  durationLabel,
  preload,
  autoPlay = false,
}: {
  teaser: Pick<Teaser, "id" | "webm" | "mp4" | "poster">;
  ariaLabel: string;
  playLabel: string;
  durationLabel: string;
  preload: "none" | "metadata";
  autoPlay?: boolean;
}) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!autoPlay) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
    return () => {
      video.pause();
      video.currentTime = 0;
    };
  }, [autoPlay]);

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
        <div className="flex items-center gap-1.5 text-[11px] text-white/30 uppercase tracking-widest">
          <span className="size-1.5 rounded-full bg-success animate-pulse motion-reduce:animate-none" />
          {t("common.liveDemo")}
        </div>
      </div>

      {/* aspect matches the encoded video (1080×512) exactly */}
      <div className="relative aspect-[1080/512] bg-obsidian-900">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          controls={started}
          playsInline
          preload={preload}
          poster={teaser.poster}
          aria-label={ariaLabel}
          onPlay={() => {
            if (!started) phCapture("teaser_play", { id: teaser.id });
            setStarted(true);
          }}
          onEnded={reset}
        >
          <source src={teaser.webm} type="video/webm" />
          <source src={teaser.mp4} type="video/mp4" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teaser.poster} alt={ariaLabel} />
        </video>

        {!started && (
          <button
            type="button"
            onClick={start}
            aria-label={playLabel}
            className="group absolute inset-0 grid place-items-center bg-obsidian-950/30 transition-colors hover:bg-obsidian-950/15"
          >
            <span className="flex flex-col items-center gap-3">
              <span className="flex size-16 items-center justify-center rounded-full bg-obsidian-950/70 ring-1 ring-white/20 backdrop-blur-sm transition-transform group-hover:scale-105">
                <Play className="size-6 translate-x-0.5 text-white" fill="currentColor" />
              </span>
              <span className="rounded-full bg-obsidian-950/60 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm">
                {durationLabel}
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
