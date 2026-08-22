"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
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

export function PreviewPanel({ initial }: { initial: PreviewProject }) {
  const [project, setProject] = useState<PreviewProject>(initial);
  const [view, setView] = useState<"before" | "after">("after");
  const [isPending, startTransition] = useTransition();
  // A run is dispatched at most once per mount. Without this, the poll landing
  // on a still-`queued` row would dispatch again on every tick.
  const dispatched = useRef(false);

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

  if (isRunning) {
    return (
      <Card className="p-6 md:p-10 text-center border-white/[0.04]">
        <Loader2 className="mx-auto size-5 animate-spin text-signal-300" />
        <p className="mt-3 text-sm text-white/70">
          Measuring your product page…
        </p>
        <p className="mt-1 text-xs text-white/40">
          We open it in a real browser, read the colours and type it actually
          uses, then place the block on it. Usually under a minute.
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

  const tokens = project.design_tokens;
  const shown = view === "after" ? project.preview_after_url : project.preview_before_url;

  return (
    <div className="space-y-6">
      {tokens && <TokenReadout tokens={tokens} />}

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-medium text-white/70">
            Your page, with the block on it
          </h3>
          <div
            className="inline-flex rounded-lg border border-white/[0.08] p-0.5"
            role="group"
            aria-label="Compare before and after"
          >
            {(["before", "after"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={
                  "px-3 py-1.5 text-xs rounded-md transition-colors " +
                  (view === v
                    ? "bg-white/[0.08] text-white"
                    : "text-white/50 hover:text-white/80")
                }
              >
                {v === "before" ? "Before" : "After"}
              </button>
            ))}
          </div>
        </div>

        {shown ? (
          <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-obsidian-950">
            {/*
              Both shots are taken at the same scroll offset, and the block is
              inserted AFTER its anchor so nothing above it moves. Toggling
              therefore changes exactly one thing on screen — which is the
              point of showing it this way rather than side by side.
            */}
            <Image
              src={shown}
              alt={
                view === "after"
                  ? "Your product page with the block added"
                  : "Your product page as it is today"
              }
              width={1440}
              height={900}
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

      <Button variant="secondary" onClick={run} disabled={isPending}>
        <RefreshCw className="size-4" />
        Re-measure this page
      </Button>
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
