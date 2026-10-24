import { redirect } from "next/navigation";
import { getUserResult } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { isReportUnlockSession, settleReportUnlock } from "@/lib/unlocks/settle";
import { createUnlockStore } from "@/lib/unlocks/settle-store";
import { UnlockReturn } from "@/components/billing/unlock-return";

export const metadata = { title: "Unlocking your report" };
export const dynamic = "force-dynamic";

/**
 * Return page of the one-time unlock Checkout (WP-3, brief oct-2026 §5.3). NOT gated by the flag: a buyer who
 * paid must always be settled. It never trusts the URL — the session is retrieved from Stripe and its
 * metadata must belong to the signed-in user. Settlement is idempotent, so it races the webhook safely.
 */
export default async function UnlockReturnPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  if (!sessionId) redirect("/app");
  const {
    data: { user },
  } = await getUserResult();
  if (!user) redirect("/sign-in");

  let analysisId: string | null = null;
  let paid = false;
  let canceled = false;
  let pending = false;
  let settled = false;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!isReportUnlockSession(session) || session.metadata?.supabase_user_id !== user.id) redirect("/app");
    analysisId = session.metadata?.analysis_id ?? null;
    if (session.status === "expired") {
      canceled = true;
    } else if (session.status === "complete" && session.payment_status === "unpaid") {
      // A delayed payment method: the buyer finished checkout but the money has not arrived yet. NOT "nothing was
      // charged" — the webhook (checkout.session.async_payment_succeeded) unlocks the report when it is confirmed.
      pending = true;
    } else if (session.status === "complete" && session.payment_status === "paid") {
      paid = true;
      try {
        const r = await settleReportUnlock(session, createUnlockStore());
        settled = r.kind === "unlocked" || r.kind === "already_unlocked";
      } catch (err) {
        // The webhook will settle it (Stripe retries); the client polls until the entitlement exists.
        console.warn("[unlock/return] settlement failed, falling back to polling:", (err as Error).message);
      }
    }
  } catch (err) {
    // redirect() throws a control-flow error: let it through
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
    console.warn("[unlock/return] session lookup failed:", (err as Error).message);
  }

  if (!analysisId) redirect("/app");
  // Canceled / expired: back to the report with a note that nothing was charged.
  if (canceled || (!paid && !pending)) redirect(`/app/analyzer/${analysisId}?unlock=canceled`);
  return <UnlockReturn analysisId={analysisId} settled={settled} pending={pending} />;
}
