import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { AnalysisView } from "@/components/analyzer/analysis-view";
import { loadNicheWinnersModule } from "@/lib/library/niche-winners";

/**
 * Design preview of the anonymous audit reveal — the real (identical-to-free)
 * AnalysisView in anonymous mode. It loads a REAL succeeded analysis from the
 * DB so the team can see the reveal with real data without the cookie gate of
 * /audit/[id] and without burning the single-use daily anonymous audit.
 *
 *   /preview/anon-audit            → most recent succeeded anonymous audit
 *                                    (falls back to the most recent succeeded)
 *   /preview/anon-audit?id=<uuid>  → that specific analysis
 *
 * Gated behind ENABLE_ANON_PREVIEW so it never renders in production unless
 * explicitly enabled. Always noindex + robots-disallowed. Read-only.
 */
export const metadata: Metadata = {
  title: "Anon reveal preview (internal)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AnonRevealPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  if (process.env.ENABLE_ANON_PREVIEW !== "true") notFound();

  const { id } = await searchParams;
  const service = createSupabaseServiceClient();

  // Pick the analysis to preview: an explicit ?id, else the most recent
  // succeeded anonymous audit, else the most recent succeeded audit at all.
  let row: Record<string, unknown> | null = null;
  if (id) {
    const { data } = await service.from("analyses").select("*").eq("id", id).single();
    row = (data as Record<string, unknown>) ?? null;
  } else {
    const { data: anonRow } = await service
      .from("analyses")
      .select("*")
      .eq("status", "succeeded")
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = (anonRow as Record<string, unknown>) ?? null;
    if (!row) {
      const { data: anyRow } = await service
        .from("analyses")
        .select("*")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      row = (anyRow as Record<string, unknown>) ?? null;
    }
  }

  if (!row || row.status !== "succeeded" || !row.result) notFound();

  const nicheWinners = await loadNicheWinnersModule({
    status: row.status as string,
    url: (row.url as string) ?? null,
    summary: (row.result as { summary?: string } | null)?.summary ?? null,
    isPaid: false,
    stored: row.niche_winners,
  });

  return (
    <AnalysisView
      initial={row as unknown as Parameters<typeof AnalysisView>[0]["initial"]}
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
