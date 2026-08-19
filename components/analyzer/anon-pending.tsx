"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalyzingState } from "./analyzing-state";
import { useT } from "@/components/i18n/locale-provider";
import type { DiscoverySignals } from "@/lib/analyzer/discovery-signals";

/**
 * Pending / failed state for an anonymous audit. While the audit runs it polls
 * the cookie-gated anon status endpoint; once it reaches a terminal state it
 * calls router.refresh() so the server page re-renders — succeeded audits then
 * hand off to the full (identical-to-free) AnalysisView.
 */
export function AnonPending({
  initial,
}: {
  initial: {
    id: string;
    status: "queued" | "running" | "failed" | "refunded";
    url: string | null;
    screenshot_url?: string | null;
    discovery_signals?: DiscoverySignals | null;
    preview_score: number | null;
    preview_summary: string | null;
    error: string | null;
  };
}) {
  const { t } = useT();
  const router = useRouter();

  const isWorking = initial.status === "queued" || initial.status === "running";
  const isFailed = initial.status === "failed" || initial.status === "refunded";

  /**
   * WP-3 — the poller used to throw away everything but `status`. The screenshot
   * and the discovery signals arrive seconds into the run, well before the audit
   * finishes, so we now keep them: this is a cold visitor's first experience of
   * the product and the wait is where they leave. Purely additive — no extra
   * request (same poll, same endpoint), no AI call.
   */
  const [live, setLive] = useState<{
    screenshotUrl: string | null;
    signals: DiscoverySignals | null;
  }>({
    screenshotUrl: initial.screenshot_url ?? null,
    signals: initial.discovery_signals ?? null,
  });

  useEffect(() => {
    if (!isWorking) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/anon-analyses/${initial.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const next = (await res.json()) as {
          status: string;
          screenshot_url?: string | null;
          discovery_signals?: DiscoverySignals | null;
        };
        if (!alive) return;
        setLive((prev) => ({
          // Never un-reveal: once shown, a null on a later poll (or a row read
          // mid-write) must not blank the screen back out.
          screenshotUrl: next.screenshot_url ?? prev.screenshotUrl,
          signals: next.discovery_signals ?? prev.signals,
        }));
        if (next.status !== "queued" && next.status !== "running") {
          // Terminal — let the server page re-render (succeeded → AnalysisView).
          router.refresh();
        }
      } catch {
        /* network blip — retry next tick */
      }
    };
    tick();
    const timer = setInterval(tick, 1800);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, isWorking]);

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/80"
        >
          <ArrowLeft className="size-3" />
          {t("anonReveal.back")}
        </Link>
        <span className="truncate text-xs text-white/40">{initial.url}</span>
      </header>

      {isWorking && (
        <AnalyzingState
          status={initial.status as "queued" | "running"}
          startedAt={null}
          previewScore={initial.preview_score}
          previewSummary={initial.preview_summary}
          screenshotUrl={live.screenshotUrl}
          signals={live.signals}
        />
      )}

      {isFailed && (
        <Card className="border-destructive/30 bg-destructive/[0.03] p-8 text-center">
          <h2 className="font-serif text-2xl tracking-tight">
            {t("anonReveal.failedTitle")}
          </h2>
          {initial.error && (
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60">
              {initial.error}
            </p>
          )}
          <Link href="/" className="mt-6 inline-block">
            <Button variant="primary">{t("anonReveal.failedRetry")}</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
