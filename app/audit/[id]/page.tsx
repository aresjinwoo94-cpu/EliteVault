import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAnonToken } from "@/lib/anon/session";
import { AnalysisView } from "@/components/analyzer/analysis-view";
import { AnonPending } from "@/components/analyzer/anon-pending";
import { loadNicheWinnersModule } from "@/lib/library/niche-winners";

// A per-session result page — never indexed, always fresh.
export const metadata: Metadata = {
  title: "Your free store audit — EliteVault",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Public reveal for an ANONYMOUS (pre-login) audit (activation funnel Tarea 1).
 *
 * Access control: the signed httpOnly `ev_anon` cookie must match the row's
 * anon_id. The row is unowned, so we read it with the service client and check
 * ownership ourselves. Once an account has claimed the audit (user_id set) we
 * send the visitor to sign-in → their owned report instead.
 *
 * When the audit has succeeded we render the SAME report a free logged-in user
 * gets — the real AnalysisView, in anonymous mode — so the experience is
 * identical to the free analyzer, with the free/Pro/Scale locks intact and a
 * "create a free account" gate layered on top. While it's still running we show
 * the anon pending poller.
 */
export default async function AnonAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const anonToken = await getAnonToken();
  if (!anonToken) notFound();

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("analyses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  // Loose runtime shape — same approach as the owned report page (our
  // hand-written Supabase types collapse to `never` across selects).
  const row = data as Record<string, unknown> & {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "refunded";
    url: string | null;
    result: unknown;
    anon_id: string | null;
    user_id: string | null;
    preview_score: number | null;
    preview_summary: string | null;
    error: string | null;
    niche_winners: unknown;
  };

  // Already claimed by an account → route the visitor to their owned report.
  if (row.user_id) {
    redirect(`/sign-in?next=${encodeURIComponent(`/app/analyzer/${id}`)}`);
  }
  // Not this browser's audit.
  if (!row.anon_id || row.anon_id !== anonToken) notFound();

  // Still running / failed → the anon poller (refreshes this page when done).
  if (row.status !== "succeeded" || !row.result) {
    return (
      <AnonPending
        initial={{
          id: row.id,
          status: row.status,
          url: row.url,
          preview_score: row.preview_score ?? null,
          preview_summary: row.preview_summary ?? null,
          error: row.error ?? null,
        }}
      />
    );
  }

  // Succeeded → the identical-to-free report. Free viewer context: the inline
  // Pro/Scale locks and the AnalyzerPaywall modals all render off isPaid:false.
  const nicheWinners = await loadNicheWinnersModule({
    status: row.status,
    url: row.url,
    summary: (row.result as { summary?: string } | null)?.summary ?? null,
    isPaid: false,
    stored: row.niche_winners,
  });

  return (
    <AnalysisView
      initial={row}
      viewer={{
        canPublish: false,
        publishedSlug: null,
        fullName: null,
        isScale: false,
        isPaid: false,
        canRunMeta: false,
        metaLimit: 0,
        metaUsed: 0,
      }}
      initialSimulation={null}
      nicheWinners={nicheWinners}
      isAnon
    />
  );
}
