"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { phCapture } from "@/lib/analytics/posthog";
import { SHARE_EVENTS } from "@/lib/analytics/share-events";

/** Fires `share_claim_done` once, then opens the claimed audit in the app. */
export function ShareClaimDone({ slug, analysisId, label }: { slug: string; analysisId: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    phCapture(SHARE_EVENTS.claimDone, { share_slug: slug });
    const t = setTimeout(() => router.replace(`/app/analyzer/${analysisId}`), 600);
    return () => clearTimeout(t);
  }, [slug, analysisId, router]);
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-center text-white">
      <p className="text-sm text-white/70">{label}</p>
    </main>
  );
}
