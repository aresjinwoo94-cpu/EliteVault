import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles, AlertTriangle } from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { Button } from "@/components/ui/button";
import { PLANS, planFromPriceId, type PlanTier } from "@/lib/stripe/plans";
import { PlanConfirmation } from "@/components/billing/plan-confirmation";

export const metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

/**
 * Stripe Embedded Checkout return page (v3.8.3).
 *
 * Stripe redirects users here after the embedded checkout flow ends —
 * either successfully or canceled. We:
 *   1. Look up the session by session_id
 *   2. If paid: do the eager sync (mirror of the webhook's syncSubscription
 *      logic) so the user sees their new plan immediately, even if the
 *      webhook hasn't fired yet.
 *   3. If canceled / unpaid: show a friendly "no charge" message.
 *
 * The webhook runs in parallel and is idempotent, so racing this is fine.
 */
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.session_id) redirect("/app/billing");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  let plan = "free" as ReturnType<typeof planFromPriceId>;
  let paid = false;
  let canceled = false;

  try {
    const session = await stripe.checkout.sessions.retrieve(sp.session_id, {
      expand: ["subscription", "subscription.items"],
    });

    if (session.status === "expired" || session.payment_status === "unpaid") {
      canceled = true;
    } else if (
      session.status === "complete" &&
      session.payment_status === "paid" &&
      session.subscription
    ) {
      const subscription =
        typeof session.subscription === "string"
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;
      const priceId = subscription.items.data[0]?.price.id ?? "";
      plan = planFromPriceId(priceId);
      paid = plan !== "free";
      const credits = PLANS[plan].monthlyCredits;

      if (paid) {
        const service = createSupabaseServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subAny = subscription as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemAny = subscription.items.data[0] as any;
        const periodStart =
          itemAny?.current_period_start ?? subAny?.current_period_start ?? null;
        const periodEnd =
          itemAny?.current_period_end ?? subAny?.current_period_end ?? null;
        const toIso = (ts: number | null) =>
          typeof ts === "number" && ts > 0
            ? new Date(ts * 1000).toISOString()
            : null;

        await service.from("subscriptions").upsert(
          {
            id: subscription.id,
            user_id: user.id,
            status: subscription.status,
            price_id: priceId,
            plan,
            current_period_start: toIso(periodStart),
            current_period_end: toIso(periodEnd),
            cancel_at_period_end: subscription.cancel_at_period_end,
            trial_end: subscription.trial_end
              ? toIso(subscription.trial_end)
              : null,
          },
          { onConflict: "id" },
        );
        await service
          .from("profiles")
          .update({ plan, credits })
          .eq("id", user.id);
      }
    }
  } catch (err) {
    console.warn(
      "[checkout/return] session lookup failed:",
      (err as Error).message,
    );
    // Soft-fail — render a "we'll process this shortly" page rather than
    // a hard error. The webhook will still fire and complete the upgrade.
  }

  // ─── Render success (with client-side polling fallback) ──────────
  // We delegate to PlanConfirmation which polls /api/me until it sees
  // the upgraded plan in the DB. Belt-and-suspenders on top of the
  // server-side eager sync above: even if the read of profile.plan
  // here caught a stale value, the client will catch up within seconds.
  if (paid) {
    // Read current plan to give PlanConfirmation a starting point
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentPlan = ((profile as any)?.plan ?? "free") as PlanTier;

    return (
      <div className="min-h-screen bg-obsidian-950 flex items-center justify-center p-6">
        <PlanConfirmation
          expectedPlan={plan as PlanTier}
          initialPlan={currentPlan}
        />
      </div>
    );
  }

  // ─── Render canceled / unpaid ───────────────────────────────────
  if (canceled) {
    return (
      <div className="min-h-screen bg-obsidian-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-warning/10 ring-1 ring-warning/30">
            <AlertTriangle className="size-7 text-warning" />
          </div>
          <div>
            <h1 className="font-serif text-3xl md:text-4xl tracking-tight">
              Checkout canceled.
            </h1>
            <p className="mt-3 text-sm text-white/60 leading-relaxed">
              No charge was made. You can resume the upgrade any time from the
              pricing page.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/pricing">
              <Button size="lg" className="w-full sm:w-auto">
                Back to pricing
              </Button>
            </Link>
            <Link href="/app/billing">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Billing
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render "processing" — session not yet paid but not canceled ─
  return (
    <div className="min-h-screen bg-obsidian-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
          <Sparkles className="size-7 text-champagne-400 animate-pulse" />
        </div>
        <div>
          <h1 className="font-serif text-3xl tracking-tight">
            Processing your payment…
          </h1>
          <p className="mt-3 text-sm text-white/60 leading-relaxed">
            Stripe is finalizing the transaction. Your plan will update within
            a minute.
          </p>
        </div>
        <Link href="/app/billing">
          <Button variant="outline" size="lg">
            Go to billing
          </Button>
        </Link>
      </div>
    </div>
  );
}
