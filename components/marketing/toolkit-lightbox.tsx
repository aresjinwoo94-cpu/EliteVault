"use client";

import { useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { phCapture } from "@/lib/analytics/posthog";
import { MAIN_TEASER, SECONDARY_TEASERS, type Teaser, type TeaserId } from "./teasers";
import type { ToolCardData, ToolkitLabels } from "./toolkit-types";

/**
 * The toolkit lightbox (gallery of real screenshots + actions). It is a
 * SEPARATE chunk: ToolkitController loads it on first hover/focus/click, so
 * Radix Dialog, next/image and this markup are not part of the landing's
 * initial JS. Only mounted once a card has been opened; stays mounted so a
 * teaser modal opened from here can finish its exit animation.
 */
const TeaserModal = dynamic(() => import("./teaser-modal").then((m) => m.TeaserModal), { ssr: false });

export type LightboxOpen = { tool: number; idx: number } | null;

export default function ToolkitLightbox({
  tools,
  labels,
  open,
  setOpen,
  openerRef,
}: {
  tools: ToolCardData[];
  labels: ToolkitLabels;
  open: LightboxOpen;
  setOpen: (v: LightboxOpen | ((o: LightboxOpen) => LightboxOpen)) => void;
  openerRef: React.MutableRefObject<HTMLElement | null>;
}) {
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [teaserOpen, setTeaserOpen] = useState(false);

  const current = open ? tools[open.tool] : null;
  const shot = current && open ? current.shots[open.idx] : null;
  const count = current?.shots.length ?? 0;

  const go = (delta: number) =>
    setOpen((o) => {
      if (!o) return o;
      const n = tools[o.tool].shots.length;
      return { ...o, idx: (o.idx + delta + n) % n };
    });

  const openTeaser = (id: TeaserId) => {
    const t = id === "main" ? MAIN_TEASER : SECONDARY_TEASERS.find((x) => x.id === id && x.ready);
    if (!t) return;
    phCapture("toolkit_action", { tool: current?.id, action: `teaser_${id}` });
    setTeaser(t);
    setTeaserOpen(true);
    setOpen(null);
  };

  const pillBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-signal-500/30 bg-signal-600/10 px-3.5 py-2 text-sm font-medium text-signal-200 transition-colors hover:bg-signal-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60";
  const navBtn =
    "absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-obsidian-950/75 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-obsidian-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60";

  return (
    <>
      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent
          className="max-w-5xl gap-3 p-3 sm:p-4"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            openerRef.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") go(-1);
            else if (e.key === "ArrowRight") go(1);
          }}
        >
          {current && shot && (
            <>
              <div className="pr-8">
                <DialogTitle>{current.name}</DialogTitle>
                <DialogDescription className="mt-0.5">{shot.caption}</DialogDescription>
              </div>

              <div className="relative overflow-hidden rounded-lg border border-white/[0.06] bg-obsidian-900">
                <Image
                  key={shot.src}
                  src={shot.src}
                  alt={shot.caption}
                  width={shot.w}
                  height={shot.h}
                  unoptimized
                  sizes="(min-width: 1024px) 960px, 100vw"
                  className="h-auto max-h-[62vh] w-full object-contain"
                />
                {count > 1 && (
                  <>
                    <button type="button" onClick={() => go(-1)} aria-label={labels.lbPrev} className={`${navBtn} left-2`}>
                      <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => go(1)} aria-label={labels.lbNext} className={`${navBtn} right-2`}>
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {current.actions.map((a, i) =>
                    a.kind === "teaser" ? (
                      <button key={i} type="button" onClick={() => openTeaser(a.teaserId)} className={pillBtn}>
                        {a.label}
                      </button>
                    ) : a.kind === "link" ? (
                      <Link
                        key={i}
                        href={a.href}
                        onClick={() => phCapture("toolkit_action", { tool: current.id, action: "link" })}
                        className={pillBtn}
                      >
                        {a.label}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                    ) : (
                      <span key={i} className="text-xs text-white/45">
                        {a.text}
                      </span>
                    ),
                  )}
                </div>
                {count > 1 && (
                  <span className="font-mono text-xs tabular-nums text-white/45" aria-live="polite">
                    {labels.lbCounter
                      .replace("{i}", String((open?.idx ?? 0) + 1))
                      .replace("{n}", String(count))}
                  </span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {teaser && (
        <TeaserModal
          teaser={teaser}
          open={teaserOpen}
          onClose={() => setTeaserOpen(false)}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            openerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
