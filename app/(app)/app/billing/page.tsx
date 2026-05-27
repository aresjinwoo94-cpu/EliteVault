import Link from "next/link";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PlanCard } from "@/components/billing/plan-card";
import { PortalButton } from "@/components/billing/portal-button";
import { PLANS, planFromPriceId } from "@/lib/stripe/plans";

export const metadata = { title: "Billing" };

// Force-dynamic — this page reads search params + does post-checkout
// sync, both of which need fresh per-request execution.
export const dynamic = "force-dynamic";

/**
 * Eager post-checkout sync.
 *
 * When Stripe redirects the user back to ?checkout=success&session_id=...,
 * we DON'T wait for the webhook. We pull the session straight from Stripe,
 * resolve the plan, and update the profile right here. The user sees their
 * new plan the instant the page renders, instead of seeing "free" for the
 * 5-30 seconds it can take a webhook delivery + retry to land.
 *
 * The webhook still fires in parallel and is idempotent (UNIQUE constraint
 * on stripe_events.id) — this just removes the latency window.
 *
 * Returns true if a sync was attempted (so the page can show a confetti/
 * welcome banner appropriately).
 */
async function eagerSyncFromCheckout(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items"],
    });
    if (
      session.payment_status !== "paid" &&
      session.status !== "complete"
    ) {
      return false;
    }
    if (!session.subscription) return false;

    // Subscription is expanded — use as-is
    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

    const priceId = subscription.items.data[0]?.price.id ?? "";
    const plan = planFromPriceId(priceId);
    if (plan === "free") return false; // unrecognized price, skip

    const grant = PLANS[plan].monthlyCredits;
    const service = createSupabaseServiceClient();

    // Stripe API v17+ moved period dates onto subscription.items[i]
    const item = subscription.items.data[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subAny = subscription as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemAny = item as any;
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
        user_id: userId,
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

    // Set plan + grant fresh credits. The webhook does the same on
    // invoice.payment_succeeded — racing them is fine because both
    // hard-set the same value (no double-grant).
    await service
      .from("profiles")
      .update({ plan, credits: grant })
      .eq("id", userId);

    return true;
  } catch (err) {
    console.warn("[billing] eager sync failed:", (err as Error).message);
    return false;
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = await searchParams;

  // If we just came back from Stripe, sync the plan eagerly BEFORE
  // reading the profile. That way the page renders with the new plan,
  // not the stale free.
  if (sp.checkout === "success" && sp.session_id && user) {
    await eagerSyncFromCheckout(sp.session_id, user.id);
  }

  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, credits, stripe_customer_id")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const plan = PLANS[profile?.plan ?? "free"];

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-5xl mx-auto space-y-8 md:space-y-10">
      <header>
        <p className="text-xs uppercase tracking-widest text-white/40">
          Billing
        </p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
          Plans & subscription
        </h1>
      </header>

      {sp.checkout === "success" && (
        <Card className="border-success/30 bg-success/[0.04] p-4 flex items-start gap-3">
          <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-white">Welcome to {plan.name} 👑</p>
            <p className="text-sm text-white/55 mt-0.5">
              Your credits are loaded. Run your first analysis →
            </p>
          </div>
          <Link href="/app/analyzer" className="ml-auto">
            <Button size="sm">Start analyzing</Button>
          </Link>
        </Card>
      )}

      {/* Current plan */}
      <Card className="p-6 md:p-8 relative overflow-hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-champagne-400/15 blur-3xl" />
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Current plan
            </p>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="font-serif text-3xl">{plan.name}</h2>
              <Badge variant={plan.id === "free" ? "default" : "gold"}>
                {plan.id.toUpperCase()}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-white/55 max-w-md">
              {plan.description}
            </p>
            {sub?.cancel_at_period_end && (
              <p className="mt-3 text-xs text-warning">
                Your plan ends on{" "}
                {new Date(sub.current_period_end!).toLocaleDateString()}.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {profile?.stripe_customer_id && (
              <PortalButton variant="outline">
                Manage in Stripe
                <ExternalLink className="size-3.5" />
              </PortalButton>
            )}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Credits left
            </p>
            <p className="mt-1 font-serif text-3xl text-gold-gradient tnum">
              {profile?.credits ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Next reset
            </p>
            <p className="mt-1 text-sm text-white/80">
              {sub?.current_period_end
                ? new Date(sub.current_period_end).toLocaleDateString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              Status
            </p>
            <p className="mt-1 text-sm text-white/80 capitalize">
              {sub?.status ?? "—"}
            </p>
          </div>
        </div>
      </Card>

      {/* Upgrade */}
      <section>
        <h2 className="text-lg font-medium tracking-tight mb-4">
          {plan.id === "scale" ? "Your plan" : "Upgrade your plan"}
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          {Object.values(PLANS).map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              current={p.id === plan.id}
              hasExistingSub={!!sub && sub.status === "active"}
            />
          ))}
        </div>
        {!!sub && sub.status === "active" && plan.id !== "scale" && (
          <p className="mt-3 text-xs text-white/40">
            Switching plans opens the Stripe Customer Portal — Stripe pro-rates
            the difference and cancels the previous tier automatically. No
            parallel subscriptions.
          </p>
        )}
      </section>

      <p className="text-xs text-white/30 text-center">
        Payments are processed securely by Stripe. You can cancel anytime from
        the Customer Portal.
      </p>
    </div>
  );
}
