"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";

/**
 * Real teaser video of the analyzer, shown in the landing's LIVE DEMO
 * section (replaced the old animated walkthrough mockup).
 *
 * Behavior:
 *   • Lazy: preload="none" until the panel nears the viewport, then an
 *     IntersectionObserver flips preload and starts playback — the video
 *     never competes with LCP.
 *   • Autoplays muted + looped, playsInline so iOS stays embedded.
 *   • prefers-reduced-motion: no autoplay — static poster with a manual
 *     play button instead.
 *   • Poster doubles as the fallback if the video can't load; the 2:1
 *     aspect ratio is reserved up front so there's no layout shift.
 */

const VIDEO_WEBM = "/videos/analyzer-teaser.webm";
const VIDEO_MP4 = "/videos/analyzer-teaser.mp4";
const POSTER = "/videos/analyzer-teaser-poster.jpg";

export function AnalyzerTeaserVideo() {
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      videoRef.current?.pause();
      return;
    }
    const el = wrapRef.current;
    const video = videoRef.current;
    if (!el || !video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.preload = "auto";
          video.muted = true;
          video
            .play()
            .then(() => setAutoplayFailed(false))
            .catch(() => setAutoplayFailed(true));
        } else {
          video.pause();
        }
      },
      // Start fetching a bit before the panel scrolls into view so the
      // first visible frame is already moving.
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reducedMotion]);

  const manualPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.preload = "auto";
    video.muted = true;
    video.play().catch(() => {});
  };

  const showPlayButton = !playing && (reducedMotion || autoplayFailed);

  return (
    <div ref={wrapRef} className="relative">
      {/* Ambient glow — teal (signal) is the AI/data accent for this surface */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl pointer-events-none" />

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
          {!reducedMotion && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-widest">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              Live demo
            </div>
          )}
        </div>

        {/* aspect-[2/1] matches the encoded video (1080×540) exactly */}
        <div className="relative aspect-[2/1] bg-obsidian-900">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full"
            muted
            loop
            playsInline
            preload="none"
            poster={POSTER}
            aria-label={t("analyzerDemo.videoAria")}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          >
            <source src={VIDEO_WEBM} type="video/webm" />
            <source src={VIDEO_MP4} type="video/mp4" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={POSTER} alt={t("analyzerDemo.videoAria")} />
          </video>

          {showPlayButton && (
            <button
              type="button"
              onClick={manualPlay}
              aria-label={t("analyzerDemo.videoPlay")}
              className="absolute inset-0 grid place-items-center bg-obsidian-950/25 transition-colors hover:bg-obsidian-950/10"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-obsidian-950/70 ring-1 ring-white/20 backdrop-blur-sm">
                <Play className="size-5 translate-x-0.5 text-white" fill="currentColor" />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
