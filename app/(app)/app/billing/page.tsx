import Link from "next/link";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,  getUserResult,
} from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PlanCard } from "@/components/billing/plan-card";
import { PortalButton } from "@/components/billing/portal-button";
import { SubscriptionActions } from "@/components/billing/subscription-actions";
import { PLANS, planFromPriceId } from "@/lib/stripe/plans";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { localizePlan } from "@/lib/i18n/plan-text";

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
  const [
    {
      data: { user },
    },
    { t, locale },
  ] = await Promise.all([getUserResult(), getT()]);

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

  const plan = localizePlan(PLANS[profile?.plan ?? "free"], t);
  const periodEnd = sub?.current_period_end
    ? formatDate(sub.current_period_end, locale)
    : null;
  // Raw Stripe statuses ("active", "past_due"…) in the site's language; an
  // unknown one falls back to the raw value rather than a missing-key path.
  const statusKey = `billing.statusMap.${sub?.status}`;
  const statusLabel = sub?.status
    ? t(statusKey) === statusKey
      ? sub.status
      : t(statusKey)
    : "—";

  return (
    <div className="p-6 md:p-10 lg:p-12 pt-10 md:pt-14 max-w-5xl mx-auto space-y-8 md:space-y-10">
      {/* The upgrade CTAs on this page lead to the Stripe checkout: open the
          connections now (React hoists these to <head>). Only on checkout and
          billing — not site-wide. */}
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="" />
      <link rel="dns-prefetch" href="https://api.stripe.com" />
      <link rel="dns-prefetch" href="https://m.stripe.network" />
      <header>
        <p className="text-xs uppercase tracking-widest text-white/40">
          {t("billing.eyebrow")}
        </p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
          {t("billing.title")}
        </h1>
      </header>

      {sp.checkout === "success" && (
        <Card className="border-success/30 bg-success/[0.04] p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-white">
              {t("billing.welcome").replace("{plan}", plan.name)}
            </p>
            <p className="text-sm text-white/55 mt-0.5">
              {t("billing.welcomeSub")}
            </p>
          </div>
          <Link href="/app/analyzer" className="sm:ml-auto">
            <Button size="sm" className="w-full sm:w-auto">
              {t("billing.startAnalyzing")}
            </Button>
          </Link>
        </Card>
      )}

      {/* Current plan */}
      <Card className="p-6 md:p-8 relative overflow-hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-champagne-400/15 blur-3xl" />
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              {t("billing.currentPlan")}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="font-serif text-3xl">{plan.name}</h2>
              <Badge variant={plan.id === "free" ? "default" : "gold"}>
                {plan.name.toUpperCase()}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-white/55 max-w-md">
              {plan.description}
            </p>
            {sub?.cancel_at_period_end && periodEnd && (
              <p className="mt-3 text-xs text-warning">
                {t("billing.planEnds").replace("{date}", periodEnd)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {!!sub &&
              (sub.status === "active" || sub.status === "trialing") && (
                <SubscriptionActions
                  cancelAtPeriodEnd={!!sub.cancel_at_period_end}
                  periodEndLabel={periodEnd}
                />
              )}
            {profile?.stripe_customer_id && (
              <PortalButton variant="outline">
                {t("billing.manageInStripe")}
                <ExternalLink className="size-3.5" />
              </PortalButton>
            )}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              {t("billing.creditsLeft")}
            </p>
            <p className="mt-1 font-serif text-3xl text-gold-gradient tnum">
              {profile?.credits ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              {t("billing.nextReset")}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {periodEnd ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">
              {t("billing.status")}
            </p>
            <p className="mt-1 text-sm text-white/80">{statusLabel}</p>
          </div>
        </div>
      </Card>

      {/* Upgrade */}
      <section>
        <h2 className="text-lg font-medium tracking-tight mb-4">
          {plan.id === "scale"
            ? t("billing.yourPlan")
            : t("billing.upgradeHeading")}
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
            {t("billing.switchNote")}
          </p>
        )}
      </section>

      <p className="text-xs text-white/30 text-center">
        {t("billing.footerNote")}
      </p>
    </div>
  );
}
