import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ShareClaimDone } from "@/components/share/share-claim-done";
import { AppScope } from "@/components/i18n/app-scope";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit claimed", robots: { index: false, follow: false } };

/** Landing of a successful claim: confirms the viewer now owns the audit, fires share_claim_done, opens the report. */
export default async function ClaimedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ a?: string }>;
}) {
  const { slug } = await params;
  const { a } = await searchParams;
  if (!a || !/^[0-9a-f-]{36}$/i.test(a)) notFound();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/s/${slug}`);
  // RLS: only the (new) owner can read the row — anyone else gets a 404.
  const { data } = await supabase.from("analyses").select("id").eq("id", a).eq("user_id", user.id).maybeSingle();
  if (!data) notFound();
  const { t } = await getT();
  return (
    <AppScope>
      <ShareClaimDone slug={slug} analysisId={a} label={t("sharedPage.claimDone")} />
    </AppScope>
  );
}
