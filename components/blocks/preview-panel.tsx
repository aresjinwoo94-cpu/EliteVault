"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestBlocksPreview } from "@/app/actions/blocks-preview";
import type { DesignTokens } from "@/lib/blocks/design-tokens";

/**
 * Liquid Blocks WP-B — the before/after, and the tokens behind it.
 *
 * Two jobs, and the second is the one that earns trust: showing the user the
 * measurements we took off their page. If the accent swatch here doesn't match
 * their buy button, they find out now — looking at a swatch — rather than after
 * pasting Liquid into a live theme. WP-C turns these readings into editable
 * fields; this is the read-only half that proves the calibration happened.
 *
 * `fallbacks` is the honest part. Anything we could NOT measure is flagged as
 * ours rather than shown as though the store had told us. That distinction is
 * the whole difference between this and a tool that invents a palette.
 */

type ProjectStatus = "queued" | "capturing" | "ready" | "failed";

export interface PreviewProject {
  id: string;
  status: ProjectStatus;
  design_tokens: (DesignTokens & { diagnostics?: Record<string, unknown> }) | null;
  preview_before_url: string | null;
  preview_after_url: string | null;
  error: string | null;
}

/** Human labels for the dotted token paths normalizeDesignTokens reports. */
const FALLBACK_LABELS: Record<string, string> = {
  "palette.pageBackground": "page background",
  "palette.textPrimary": "text colour",
  "palette.accent": "button colour",
  "palette.accentText": "button text colour",
  "palette.surface": "card background",
  "type.bodyFamily": "body font",
  "type.headingFamily": "heading font",
  "type.baseSizePx": "base text size",
  "type.bodyWeight": "body weight",
  "type.headingWeight": "heading weight",
  "shape.radiusPx": "corner rounding",
  "shape.containerMaxWidthPx": "content width",
};

const POLL_MS = 2500;

/**
 * Smooth scrolling is movement, and a motion preference is an accessibility
 * setting rather than a style opinion. `scrollTo` takes its behaviour as an
 * argument, so unlike a CSS transition it cannot be gated by a media query in
 * the stylesheet — it has to be asked here.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function PreviewPanel({
  initial,
  hasBlock,
}: {
  initial: PreviewProject;
  /**
   * Whether the project has a block chosen yet.
   *
   * The panel cannot infer this from its own row: a project that has been
   * measured but not composed looks identical to one whose capture failed —
   * both have tokens and no images — and those two states need opposite
   * messages. One says "choose something"; the other says "something went
   * wrong".
   */
  hasBlock: boolean;
}) {
  const router = useRouter();
  const [project, setProject] = useState<PreviewProject>(initial);
  const [view, setView] = useState<"before" | "after">("after");
  const [isPending, startTransition] = useTransition();
  // A run is dispatched at most once per mount. Without this, the poll landing
  // on a still-`queued` row would dispatch again on every tick.
  const dispatched = useRef(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  /**
   * Adopt the row the SERVER hands down whenever it changes.
   *
   * `useState(initial)` seeds once and then ignores its prop forever, and
   * WP-F.7 turned that from a latent staleness into a broken happy path.
   * Choosing a block saves the spec, queues a run and calls router.refresh();
   * the server re-renders with status "queued" and no images — and this
   * component kept its own "ready" from the measure-only run. isRunning stayed
   * false, so no spinner and THE POLL NEVER STARTED, and the panel rendered
   * "No after image for this project" under a toast promising a preview. It
   * never recovered on its own.
   *
   * The server is authoritative at the moment it re-renders, so adopting is
   * right. Guarded on content rather than identity: the prop object is new on
   * every render, and re-seeding state on each one would throw away the poll's
   * own fresher answer between refreshes.
   */
  const adopted = useRef(JSON.stringify(initial));
  useEffect(() => {
    const next = JSON.stringify(initial);
    if (next === adopted.current) return;
    adopted.current = next;
    setProject(initial);
  }, [initial]);

  const isRunning = project.status === "queued" || project.status === "capturing";

  const run = useCallback(() => {
    startTransition(async () => {
      const res = await requestBlocksPreview(project.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setProject((p) => ({ ...p, status: "capturing", error: null }));
    });
  }, [project.id]);

  // Auto-start: arriving at a fresh project should measure the store, not park
  // on a button. A project that already failed is NOT retried automatically —
  // a store that blocks headless browsers would loop forever.
  useEffect(() => {
    if (dispatched.current) return;
    if (initial.status === "queued" && !initial.preview_after_url) {
      dispatched.current = true;
      run();
    }
  }, [initial.status, initial.preview_after_url, run]);

  useEffect(() => {
    if (!isRunning) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/blocks-projects/${project.id}`, {
          cache: "no-store",
        });
        if (!res.ok || !alive) return;
        const next = (await res.json()) as PreviewProject;
        setProject((prev) => ({ ...prev, ...next }));
      } catch {
        // A dropped poll is not an error state — the next tick retries.
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isRunning, project.id]);

  /**
   * Tell the SERVER the run finished, once.
   *
   * The poll above updates this component's own state, and nothing else. But
   * the block gallery is rendered by the page, gated on `design_tokens` being
   * present in the row — which the server read before the run existed. So the
   * first preview completed, the pictures appeared, and the single most
   * important thing to do next stayed invisible until the merchant happened to
   * reload. That is the "I couldn't find them" report, arriving a second time
   * through a different door.
   *
   * `router.refresh()` re-runs the server component with the tokens now in
   * place. It is a refresh, not a navigation: scroll position and the state of
   * everything on the page survive it.
   */
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (project.status !== "ready" || !project.design_tokens) return;

    /**
     * Refresh when the measurement CHANGED, not merely the first time.
     *
     * The first version returned early if the page already had tokens, which
     * covered the first run and left the second one broken: the pipeline
     * rewrites design_tokens on EVERY run, so after "Re-measure this page" the
     * page showed two different measurements at once — TokenReadout (client
     * state, fresh) above TokenEditor (props, stale). The editor is where the
     * merchant corrects values before the export reads them, so the stale set
     * was the one that would have reached their Liquid.
     *
     * Comparing the readings instead is self-limiting: after the refresh the
     * server hands down the same tokens we polled, the signatures match, and
     * nothing fires again. `refreshedFor` bounds it even if they never
     * converge — one refresh per distinct reading, never a loop.
     */
    const polled = JSON.stringify(project.design_tokens);
    if (polled === JSON.stringify(initial.design_tokens)) return;
    if (polled === refreshedFor.current) return;
    refreshedFor.current = polled;
    router.refresh();
  }, [project.status, project.design_tokens, initial.design_tokens, router]);

  if (isRunning) {
    return (
      <Card className="p-6 md:p-10 text-center border-white/[0.04]">
        <Loader2 className="mx-auto size-5 animate-spin text-signal-300" />
        <p className="mt-3 text-sm text-white/70">
          {hasBlock
            ? "Putting your block on the page…"
            : "Measuring your product page…"}
        </p>
        {/*
          Two different waits, and they deserve two different sentences. The
          first visit is measuring; every visit after a choice is rendering
          that choice. One message for both left a merchant who had just
          picked a block watching a spinner that talked about colours.
        */}
        <p className="mt-1 text-xs text-white/40">
          {hasBlock
            ? "We open your real product page in a browser, place the block where it would go, and photograph the whole page. Usually under a minute."
            : "We open it in a real browser and read the colours and type it actually uses. Usually under a minute."}
        </p>
      </Card>
    );
  }

  if (project.status === "failed") {
    return (
      <Card className="p-6 border-destructive/20 bg-destructive/[0.03]">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm text-white/80">
              {project.error ?? "We couldn't build the preview."}
            </p>
            <p className="mt-1 text-xs text-white/40">
              Nothing was charged — the preview is free.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={run}
              disabled={isPending}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  /**
   * Nothing chosen yet: say so, and point up.
   *
   * The panel used to preview `product_facts` — a block the merchant had not
   * asked for and could not export — so their first visit showed a finished
   * picture of the wrong thing while the actual next step sat unnoticed above
   * it. An empty state that names the next action is more useful than a
   * preview of a decision nobody made.
   *
   * Deliberately AFTER the running check, so a measurement in flight still
   * shows its own progress rather than this.
   */
  if (!hasBlock) {
    return (
      <Card className="p-6 md:p-10 text-center border-white/[0.04] border-dashed">
        <ArrowUp className="mx-auto size-5 text-white/30" />
        <p className="mt-3 text-sm text-white/80">
          First, choose what to add to your product page
        </p>
        <p className="mt-1.5 text-xs text-white/45 max-w-sm mx-auto">
          {project.design_tokens
            ? "We've measured your page's colours and type — pick a block above and we'll show it on your real product page."
            : "We're reading your page now. Pick a block above and we'll show it in place."}
        </p>
      </Card>
    );
  }

  const tokens = project.design_tokens;
  /**
   * The captured page's real dimensions, with a viewport-shaped fallback.
   *
   * A project measured before WP-F.7 has no capture geometry recorded, and
   * next/image needs SOME intrinsic size. The fallback is the old constant, so
   * an old row renders exactly as it used to rather than not at all.
   */
  const diagnostics = (tokens?.diagnostics ?? {}) as Record<string, unknown>;
  const capture = {
    width: typeof diagnostics.captureWidth === "number" ? diagnostics.captureWidth : 1440,
    height: typeof diagnostics.captureHeight === "number" ? diagnostics.captureHeight : 900,
    blockTop: typeof diagnostics.blockOffsetPx === "number" ? diagnostics.blockOffsetPx : 0,
    /*
     * Whether the block is actually inside the picture.
     *
     * A page taller than the capture ceiling is clipped, and a block below the
     * cut is simply absent from an image captioned "your product page with the
     * block added". That reached the merchant with nothing but a server-side
     * console.warn, and the jump button pointed past the end of the image.
     * Undefined on rows captured before this existed, which is why the check
     * below is `=== false` rather than falsy.
     */
    blockInCapture: diagnostics.blockInCapture as boolean | undefined,
  };
  const shown = view === "after" ? project.preview_after_url : project.preview_before_url;

  return (
    <div className="space-y-6">
      {tokens && <TokenReadout tokens={tokens} />}

      <div>
        {/*
          The toggle IS the product's argument, so it gets the weight of one.
          It was a pair of small grey chips tucked at the end of a heading row —
          the same visual rank as a filter — and reviewers didn't notice the
          single most persuasive control on the page.

          Three changes carry it: it sits on its own line at full width instead
          of competing with the heading; the active side is a solid champagne
          pill rather than a 6% white wash, so which view you're on is legible
          at a glance; and the ACTIVE view is named underneath in words, because
          a toggle only lands if you know what changed between the two.
        */}
        <div className="mb-4">
          <h3 className="text-sm font-medium text-white/70">
            Your page, with the block on it
          </h3>

          <div
            className="mt-3 inline-flex w-full sm:w-auto rounded-xl border border-white/[0.10] bg-obsidian-950/60 p-1"
            // A focusable scroll container is a landmark, and `region` is the
            // role that gets announced as one. `group` is generic — and was
            // already in use by the before/after toggle fifty lines above, so
            // the panel had two of them.
            role="region"
            aria-label="Compare your page before and after the block"
          >
            {(["before", "after"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={
                  "flex-1 sm:flex-none sm:min-w-[8.5rem] px-5 py-3 text-sm font-medium rounded-lg transition-all " +
                  (view === v
                    ? "bg-champagne-400 text-obsidian-950 shadow-lg shadow-champagne-400/20"
                    : "text-white/55 hover:text-white hover:bg-white/[0.04]")
                }
              >
                {v === "before" ? "Before" : "After"}
              </button>
            ))}
          </div>

          <p className="mt-2.5 text-xs text-white/45">
            {view === "after" ? (
              <>
                {/*
                  "Same scroll position" described the old viewport crop, where
                  both shots were pinned to one offset. These are full pages —
                  there is no single scroll position to share, and the two can
                  differ in height by the block itself. Claiming otherwise is a
                  small lie about the one control the product argues with.
                */}
                <span className="text-champagne-400/90">Showing the block</span>{" "}
                — your whole page, with one thing added. Scroll to explore it.
              </>
            ) : (
              <>Your page exactly as it is today. Switch to After to see the block.</>
            )}
          </p>
        </div>

        {shown && capture.blockInCapture === false && (
          <div className="rounded-lg border border-warning/25 bg-warning/[0.05] px-4 py-3">
            <p className="text-xs text-warning/90">
              Your page is taller than we can photograph in one go, and your
              block sits below the cut — so it is not in the image below. It
              will still render in the right place on your live page.
            </p>
          </div>
        )}

        {shown ? (
          /**
           * A window onto the WHOLE page, scrollable.
           *
           * The capture used to be one viewport centred on the block, which
           * answered "does the block look right" and nothing else — a merchant
           * cannot judge whether it sits well on their page through a 900px
           * porthole. Now the shot is the entire product page and this is a
           * scroller over it, so they move down it the way a shopper would.
           *
           * The intrinsic size comes from the capture, not from a constant:
           * a full-page shot is a different shape on every store, and a fixed
           * 1440x900 would squash it.
           */
          <div
            className="rounded-xl overflow-y-auto overscroll-contain border border-white/[0.06] bg-obsidian-950 max-h-[70vh]"
            /* Named, because a scrollable region has to be reachable and
               announced for anyone not using a mouse. tabIndex makes it
               keyboard-scrollable, which a plain overflow container is not. */
            role="group"
            aria-label={
              view === "after"
                ? "Your product page with the block added — scroll to explore"
                : "Your product page as it is today — scroll to explore"
            }
            tabIndex={0}
            ref={scrollerRef}
          >
            <Image
              src={shown}
              alt={
                view === "after"
                  ? "Your product page with the block added"
                  : "Your product page as it is today"
              }
              width={capture.width}
              height={capture.height}
              className="w-full h-auto"
              unoptimized
            />
          </div>
        ) : (
          <Card className="p-6 text-center border-white/[0.04]">
            <p className="text-sm text-white/40">
              No {view} image for this project.
            </p>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={run} disabled={isPending}>
          <RefreshCw className="size-4" />
          Re-measure this page
        </Button>
        {/*
          The whole page is a lot of page. A merchant opening this wants to
          see ONE thing, and hunting for it by dragging a scrollbar is the
          cost of showing them everything — so this pays it back.
          Hidden when we have no offset (a project measured before WP-F.7),
          rather than scrolling to the top and pretending that was the block.
        */}
        {shown && capture.blockTop > 0 && capture.blockInCapture !== false && (
          <Button
            variant="ghost"
            onClick={() => {
              const el = scrollerRef.current;
              if (!el) return;
              // The image is scaled to the container width, so the capture
              // offset has to be scaled with it or the jump lands wrong on
              // every viewport that is not exactly the capture width.
              const scale = el.clientWidth / capture.width;
              el.scrollTo({
                top: Math.max(0, capture.blockTop * scale - 80),
                behavior: prefersReducedMotion() ? "auto" : "smooth",
              });
            }}
          >
            <ArrowDownToLine className="size-4" />
            Jump to the block
          </Button>
        )}
      </div>
    </div>
  );
}

function Swatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="size-6 shrink-0 rounded border border-white/20"
        style={{ backgroundColor: value }}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-[10px] uppercase tracking-widest text-white/40">
          {label}
        </span>
        <span className="block font-mono text-xs text-white/70">{value}</span>
      </span>
    </div>
  );
}

function TokenReadout({
  tokens,
}: {
  tokens: DesignTokens & { diagnostics?: Record<string, unknown> };
}) {
  const unmeasured = tokens.fallbacks ?? [];
  return (
    <Card className="p-5 border-white/[0.04]">
      <h3 className="text-sm font-medium text-white/70">
        What we measured on your page
      </h3>
      <p className="mt-1 text-xs text-white/40">
        These are read from your live product page, not chosen by us — they&apos;re
        what styles the block.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Swatch label="Accent (your buy button)" value={tokens.palette.accent} />
        <Swatch label="Page background" value={tokens.palette.pageBackground} />
        <Swatch label="Text" value={tokens.palette.textPrimary} />
      </div>

      <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-widest text-white/40">
            Heading font
          </dt>
          <dd className="mt-0.5 text-white/80 truncate">{tokens.type.headingFamily}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-widest text-white/40">
            Body font
          </dt>
          <dd className="mt-0.5 text-white/80 truncate">{tokens.type.bodyFamily}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-widest text-white/40">
            Corner rounding
          </dt>
          <dd className="mt-0.5 text-white/80">{tokens.shape.radiusPx}px</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-widest text-white/40">
            Content width
          </dt>
          <dd className="mt-0.5 text-white/80">{tokens.shape.containerMaxWidthPx}px</dd>
        </div>
      </dl>

      {unmeasured.length > 0 && (
        /*
          The honest disclosure. Everything above came off the page; these did
          not, and saying so is what stops the tool from becoming the thing it
          was built to replace. WP-C turns this list into the fields the user
          can correct before any code is generated.
        */
        <div className="mt-5 rounded-lg border border-warning/20 bg-warning/[0.04] px-4 py-3">
          <p className="text-xs text-white/70">
            We couldn&apos;t read{" "}
            <strong className="text-white/90">
              {unmeasured
                .map((f) => FALLBACK_LABELS[f] ?? f)
                .join(", ")}
            </strong>{" "}
            from your page, so those are our best guess — not your store&apos;s
            values. You&apos;ll be able to correct them before any code is
            generated.
          </p>
        </div>
      )}
    </Card>
  );
}
