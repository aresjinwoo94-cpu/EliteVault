"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  AnalyzerDiagram,
  LibraryDiagram,
  SimulatorDiagram,
} from "./toolkit-diagrams";
import { MAIN_TEASER, SECONDARY_TEASERS, type Teaser, type TeaserId } from "./teasers";

// The teaser modal (Radix Dialog + player) is only fetched when someone asks for it.
const loadModal = () => import("./teaser-modal").then((m) => m.TeaserModal);
const TeaserModal = dynamic(loadModal, { ssr: false });

export type ToolId = "analyzer" | "library" | "simulator";

export type ToolShot = { src: string; w: number; h: number; caption: string };

export type ToolAction =
  | { kind: "teaser"; teaserId: TeaserId; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "note"; text: string };

export type ToolCardData = {
  id: ToolId;
  name: string;
  line: string;
  pill: string;
  shots: ToolShot[];
  actions: ToolAction[];
};

export type ToolkitLabels = {
  seeIt: string;
  lbPrev: string;
  lbNext: string;
  lbCounter: string; // "{i} / {n}"
  dPotential: string;
  dYourStore: string;
  dTop: string;
  dBreakEven: string;
  dDays: string;
};

function Diagram({ id, labels }: { id: ToolId; labels: ToolkitLabels }) {
  if (id === "analyzer") return <AnalyzerDiagram potentialLabel={labels.dPotential} />;
  if (id === "library")
    return <LibraryDiagram youLabel={labels.dYourStore} topLabel={labels.dTop} />;
  return <SimulatorDiagram breakEvenLabel={labels.dBreakEven} daysLabel={labels.dDays} />;
}

/**
 * One whole-card button. The diagram animation is armed by `data-in`, flipped
 * once when the card first enters the viewport (CSS only; reduced-motion safe).
 */
function ToolCard({
  tool,
  labels,
  onOpen,
}: {
  tool: ToolCardData;
  labels: ToolkitLabels;
  onOpen: (el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      data-in={inView}
      aria-haspopup="dialog"
      onClick={(e) => onOpen(e.currentTarget)}
      onPointerEnter={() => void loadModal()}
      className="group flex h-full w-full cursor-pointer flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60 md:p-5"
    >
      <span className="block aspect-[5/3] w-full max-md:mx-auto max-md:max-h-[150px]">
        <Diagram id={tool.id} labels={labels} />
      </span>
      <span className="mt-3 block font-serif text-base text-white md:mt-4">{tool.name}</span>
      <span className="mt-1 block text-sm leading-relaxed text-white/55">{tool.line}</span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <span className="rounded-full border border-signal-500/25 bg-signal-600/10 px-2.5 py-0.5 font-mono text-[11px] text-signal-200">
          {tool.pill}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-signal-300 transition-colors group-hover:text-signal-200">
          {labels.seeIt}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </button>
  );
}

export function ToolkitCards({
  tools,
  labels,
}: {
  tools: ToolCardData[];
  labels: ToolkitLabels;
}) {
  const [open, setOpen] = useState<{ tool: number; idx: number } | null>(null);
  const [teaser, setTeaser] = useState<Teaser | null>(null);
  const [teaserOpen, setTeaserOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

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

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-3">
        {tools.map((tool, i) => (
          <li key={tool.id}>
            <ToolCard
              tool={tool}
              labels={labels}
              onOpen={(el) => {
                opener.current = el;
                phCapture("toolkit_open", { tool: tool.id });
                setOpen({ tool: i, idx: 0 });
              }}
            />
          </li>
        ))}
      </ul>

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent
          className="max-w-5xl gap-3 p-3 sm:p-4"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
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
                    <button
                      type="button"
                      onClick={() => go(-1)}
                      aria-label={labels.lbPrev}
                      className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-obsidian-950/75 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-obsidian-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60"
                    >
                      <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => go(1)}
                      aria-label={labels.lbNext}
                      className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-obsidian-950/75 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-obsidian-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {current.actions.map((a, i) =>
                    a.kind === "teaser" ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openTeaser(a.teaserId)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-signal-500/30 bg-signal-600/10 px-3.5 py-2 text-sm font-medium text-signal-200 transition-colors hover:bg-signal-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60"
                      >
                        {a.label}
                      </button>
                    ) : a.kind === "link" ? (
                      <Link
                        key={i}
                        href={a.href}
                        onClick={() => phCapture("toolkit_action", { tool: current.id, action: "link" })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-signal-500/30 bg-signal-600/10 px-3.5 py-2 text-sm font-medium text-signal-200 transition-colors hover:bg-signal-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-500/60"
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
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}
