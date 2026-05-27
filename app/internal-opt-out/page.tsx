"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ShieldOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Manual analytics opt-out / opt-in page (dev-facing, not linked from
 * anywhere in the public UI).
 *
 * Useful for:
 *   - QA-testing the marketing site from a fresh browser without ever
 *     signing in (the server-side INTERNAL_EMAILS gate can't fire).
 *   - Adding co-founders / staff / family devices that aren't in
 *     INTERNAL_EMAILS but should still be excluded.
 *   - Reverting after testing: the page exposes a "Re-enable" button.
 *
 * URL: https://YOUR-DOMAIN/internal-opt-out
 *
 * Doesn't set a cookie or anything server-aware — just toggles the same
 * localStorage flag `__ev_no_analytics` that the AnalyticsGate honors.
 * That means the opt-out is per-browser-profile, which is what you want
 * (incognito + regular Chrome are independently silenced/unsilenced).
 */
export default function InternalOptOutPage() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setOptedOut(
        window.localStorage.getItem("__ev_no_analytics") === "1",
      );
    } catch {
      setOptedOut(false);
    }
  }, []);

  function optOut() {
    try {
      window.localStorage.setItem("__ev_no_analytics", "1");
      setOptedOut(true);
    } catch {
      alert("Couldn't access localStorage — opt-out unavailable in this browser.");
    }
  }

  function optIn() {
    try {
      window.localStorage.removeItem("__ev_no_analytics");
      setOptedOut(false);
    } catch {
      /* no-op */
    }
  }

  if (optedOut === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-white/40">Checking analytics status…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div
          className={`mx-auto flex size-16 items-center justify-center rounded-full ring-2 ${
            optedOut
              ? "bg-success/15 ring-success/30"
              : "bg-white/[0.04] ring-white/15"
          }`}
        >
          {optedOut ? (
            <ShieldOff className="size-7 text-success" />
          ) : (
            <ShieldCheck className="size-7 text-white/60" />
          )}
        </div>

        <div>
          <h1 className="font-serif text-3xl tracking-tight">
            Analytics on this browser
          </h1>
          <p className="mt-3 text-sm text-white/55 leading-relaxed">
            {optedOut ? (
              <>
                <CheckCircle2 className="inline size-3.5 text-success mr-1 align-text-bottom" />
                Excluded. Nothing you do on EliteVault from this browser is
                being sent to Vercel Analytics, Speed Insights, or PostHog.
                Stripe events still happen normally — those aren&apos;t
                analytics.
              </>
            ) : (
              <>
                Currently included in product analytics. Click below to
                exclude this browser permanently (until you re-enable).
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          {optedOut ? (
            <Button variant="outline" size="lg" onClick={optIn}>
              Re-enable analytics
            </Button>
          ) : (
            <Button size="lg" onClick={optOut}>
              Exclude this browser
            </Button>
          )}
          <Link href="/">
            <Button variant="ghost" size="lg">
              Back to site
            </Button>
          </Link>
        </div>

        <p className="text-[11px] text-white/35 pt-4 leading-relaxed">
          Stored in localStorage as <code>__ev_no_analytics</code>. Clearing
          your browser data will undo this and you&apos;ll need to visit
          this page again.
        </p>
      </div>
    </div>
  );
}
