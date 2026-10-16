"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { phCapture } from "@/lib/analytics/posthog";
import { useT } from "@/components/i18n/locale-provider";

const MAX_POLLS = 20;
const POLL_MS = 1500;

/**
 * After the one-time unlock payment (WP-3, brief oct-2026 §5.3). The server already tried to settle the
 * session; `settled` says whether it did. If it did we go straight to the report; if not (the webhook is
 * still racing, or a transient error) we poll /api/unlocks/<id> until the entitlement row exists. Payment is
 * never lost either way: settlement is idempotent and Stripe retries the webhook.
 * Fires `unlock_paid` exactly once per audit.
 */
export function UnlockReturn({ analysisId, settled, pending = false }: { analysisId: string; settled: boolean; pending?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const [done, setDone] = useState(settled);
  const fired = useRef(false);

  useEffect(() => {
    if (!done) return;
    if (!fired.current) {
      fired.current = true;
      try {
        if (!sessionStorage.getItem(`ev_unlock_paid_${analysisId}`)) {
          sessionStorage.setItem(`ev_unlock_paid_${analysisId}`, "1");
          phCapture("unlock_paid", { analysis_id: analysisId });
        }
      } catch {
        phCapture("unlock_paid", { analysis_id: analysisId });
      }
    }
    const to = setTimeout(() => router.replace(`/app/analyzer/${analysisId}?unlocked=1`), 600);
    return () => clearTimeout(to);
  }, [done, analysisId, router]);

  useEffect(() => {
    if (done || attempts >= MAX_POLLS) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/unlocks/${analysisId}`, { cache: "no-store" });
        if (res.ok && ((await res.json()) as { unlocked?: boolean }).unlocked) {
          setDone(true);
          return;
        }
      } catch {
        /* network blip: try again */
      }
      setAttempts((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [done, attempts, analysisId]);

  // A delayed payment (not yet confirmed) is shown as "processing", never as slow/failed.
  const slow = !done && !pending && attempts >= MAX_POLLS;
  const waiting = pending && !done;
  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-950 p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-signal-600/10 ring-1 ring-signal-500/30">
          {done ? (
            <CheckCircle2 className="size-7 text-signal-300" />
          ) : slow ? (
            <AlertTriangle className="size-7 text-warning" />
          ) : (
            <Loader2 className="size-7 animate-spin text-champagne-400" />
          )}
        </div>
        <h1 className="font-serif text-2xl text-white">
          {waiting ? t("unlock.pendingTitle") : slow ? t("unlock.activatingSlow") : t("unlock.activating")}
        </h1>
        {waiting ? <p className="text-sm text-white/55">{t("unlock.pendingSub")}</p> : !slow && <p className="text-sm text-white/55">{t("unlock.activatingSub")}</p>}
        <Link href={`/app/analyzer/${analysisId}`} className="inline-block text-sm text-signal-300 hover:underline">
          {t("unlock.openReport")}
        </Link>
      </div>
    </div>
  );
}
