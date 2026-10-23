"use client";

import { useRef, useState } from "react";
import { Gem, Play } from "lucide-react";
import { useT } from "@/components/i18n/locale-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { phCapture } from "@/lib/analytics/posthog";
import { TeaserFrame } from "./teaser-frame";
import { readySecondaryTeasers, type Teaser } from "./teasers";

/**
 * "More demos" — the secondary teasers, shown as compact chapter cards under
 * the hero's main player. They read as extra chapters, not competitors: no
 * glow, 1px hairline border, roughly a third of the main player's height.
 *
 * Renders NOTHING when no secondary is `ready` (see teasers.ts), so the hero is
 * unchanged until Ariel drops the videos in. The <video> of a secondary teaser
 * is mounted only inside the open modal (preload="none"), and the card posters
 * are lazy — nothing here touches the hero's LCP.
 */
export function TeaserMoreDemos() {
  const { t } = useT();
  const teasers = readySecondaryTeasers();
  const [openId, setOpenId] = useState<Teaser["id"] | null>(null);
  // Keep the last-opened teaser mounted while the dialog plays its exit
  // animation (no empty box flashing); playback itself stops the instant
  // openId clears (TeaserFrame pauses + rewinds when autoPlay goes false).
  const [shownId, setShownId] = useState<Teaser["id"] | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  if (teasers.length === 0) return null;

  const open = teasers.find((x) => x.id === (openId ?? shownId)) ?? null;

  return (
    // On lg the row hangs below the player OUT of the flow, so the main player
    // keeps the exact size and position it has without the row (the hero
    // column is vertically centered; in-flow height would push it up).
    <div className="relative mt-5 lg:absolute lg:inset-x-0 lg:top-full">
      <p className="mb-2.5 text-center text-xs font-mono uppercase tracking-widest text-white/40">
        {t("teasers.moreDemos")}
      </p>
      <ul className="grid grid-cols-2 gap-3">
        {teasers.map((x) => (
          <li key={x.id} className={teasers.length === 1 ? "col-span-2" : undefined}>
            <button
              type="button"
              onClick={(e) => {
                phCapture("teaser_open", { id: x.id });
                triggerRef.current = e.currentTarget;
                setShownId(x.id);
                setOpenId(x.id);
              }}
              className="group flex w-full flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/50 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="relative block aspect-[1080/512] w-full shrink-0 overflow-hidden rounded-md bg-obsidian-900 sm:w-28">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={x.poster}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-obsidian-950/35 transition-colors group-hover:bg-obsidian-950/20">
                  <span className="grid size-7 place-items-center rounded-full bg-obsidian-950/70 ring-1 ring-white/20">
                    <Play className="size-3 translate-x-px text-white" fill="currentColor" aria-hidden />
                  </span>
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {x.badge === "pro" && (
                    <span className="rounded bg-signal-600/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-signal-300 ring-1 ring-signal-500/25">
                      PRO
                    </span>
                  )}
                  {x.badge === "diamond" && (
                    <span className="grid size-5 place-items-center rounded bg-signal-600/15 ring-1 ring-signal-500/25">
                      <Gem className="size-3 text-signal-300" aria-hidden />
                    </span>
                  )}
                  <span className="line-clamp-2 font-serif text-sm leading-snug text-white">
                    {t(x.titleKey)}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] text-white/40">
                  {t(x.durationLabelKey)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={openId !== null} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent
          className="max-w-3xl gap-3 p-3 sm:p-4"
          onCloseAutoFocus={(e) => {
            // Controlled dialog (no <DialogTrigger>): hand focus back to the card.
            e.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          {open && (
            <>
              <div className="pr-8">
                <DialogTitle>{t(open.titleKey)}</DialogTitle>
                <DialogDescription className="mt-0.5">{t(open.subKey)}</DialogDescription>
              </div>
              <TeaserFrame
                key={open.id}
                teaser={open}
                ariaLabel={t(open.titleKey)}
                playLabel={t("analyzerDemo.videoPlay")}
                durationLabel={t(open.durationLabelKey)}
                preload="none"
                autoPlay={openId !== null}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
