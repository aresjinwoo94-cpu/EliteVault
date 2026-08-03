import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAnonToken } from "@/lib/anon/session";
import {
  AnonAnalysisView,
  type AnonAudit,
} from "@/components/analyzer/anon-analysis-view";
import type { Annotation } from "@/lib/supabase/types";

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
    .select(
      "id, status, url, screenshot_url, result, preview_score, preview_summary, error, anon_id, user_id",
    )
    .eq("id", id)
    .single();

  if (error || !data) notFound();

  const row = data as {
    id: string;
    status: AnonAudit["status"];
    url: string | null;
    screenshot_url: string | null;
    result: { score?: number; annotations?: Annotation[]; top_fixes?: unknown[] } | null;
    preview_score: number | null;
    preview_summary: string | null;
    error: string | null;
    anon_id: string | null;
    user_id: string | null;
  };

  // Already claimed by an account → this anon page no longer serves it. Route
  // the visitor to their owned report behind sign-in.
  if (row.user_id) {
    redirect(`/sign-in?next=${encodeURIComponent(`/app/analyzer/${id}`)}`);
  }

  // Not this browser's audit.
  if (!row.anon_id || row.anon_id !== anonToken) notFound();

  const succeeded = row.status === "succeeded";
  const initial: AnonAudit = {
    id: row.id,
    status: row.status,
    url: row.url,
    screenshot_url: row.screenshot_url,
    error: row.error,
    preview_score: row.preview_score,
    preview_summary: row.preview_summary,
    score: row.result?.score ?? null,
    annotations: succeeded ? (row.result?.annotations ?? []) : [],
    fixes_total: Array.isArray(row.result?.top_fixes)
      ? row.result!.top_fixes!.length
      : 0,
  };

  return <AnonAnalysisView initial={initial} />;
}
