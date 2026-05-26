import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { planFromPriceId, PLANS } from "@/lib/stripe/plans";
import type { PlanTier, SubscriptionStatus } from "@/lib/supabase/types";

export const runtime = "nodejs";

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }
  const body = await req.text();

  // Stripe has DIFFERENT signing secrets for Test mode and Live mode.
  // If we only configure one and a webhook arrives signed by the other,
  // signature verification fails silently and the user's plan never
  // updates (the issue the user just hit). We try ALL configured secrets
  // and accept the first one that verifies — that way a single deploy
  // handles both Test and Live without env-var juggling.
  //
  // Set both in Vercel:
  //   STRIPE_WEBHOOK_SECRET        — your Live mode signing secret
  //   STRIPE_WEBHOOK_SECRET_TEST   — your Test mode signing secret
  // (You can set just one if you only operate in one mode.)
  const candidateSecrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_TEST,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);

  if (candidateSecrets.length === 0) {
    return NextResponse.json({ error: "no_webhook_secret" }, { status: 500 });
  }

  let event: Stripe.Event | null = null;
  let lastErr: Error | null = null;
  for (const secret of candidateSecrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
      break;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  if (!event) {
    return NextResponse.json(
      {
        error: `signature_verification_failed: ${lastErr?.message ?? "no matching secret"}`,
      },
      { status: 400 },
    );
  }

  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const service = createSupabaseServiceClient();

  // ── Idempotency: dedupe by event.id ──
  // UNIQUE constraint on stripe_events.id makes the second delivery a no-op.
  const { error: dupErr } = await service.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (dupErr && dupErr.code === "23505") {
    // already processed
    return NextResponse.json({ received: true, duplicate: true });
  } else if (dupErr) {
    // fail loud so Stripe retries
    return NextResponse.json({ error: dupErr.message }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event, service);
        break;
      case "invoice.payment_succeeded":
        await onInvoicePaid(event, service);
        break;
      case "invoice.payment_failed":
        await onInvoiceFailed(event, service);
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

async function syncSubscription(
  event: Stripe.Event,
  service: ReturnType<typeof createSupabaseServiceClient>,
) {
  // Resolve the subscription regardless of event payload shape
  let subscription: Stripe.Subscription;
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.subscription) return;
    subscription = await stripe.subscriptions.retrieve(
      session.subscription as string,
    );
  } else {
    subscription = event.data.object as Stripe.Subscription;
  }

  // Find the user via Stripe customer
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();

  // Fall back to metadata (set during checkout)
  const userId =
    profile?.id ?? (subscription.metadata?.supabase_user_id as string | undefined);
  if (!userId) {
    console.warn(
      "[webhook] sub event with no resolvable user",
      subscription.id,
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price.id ?? "";
  const plan: PlanTier = planFromPriceId(priceId);
  const status = subscription.status as SubscriptionStatus;

  const isActive = status === "active" || status === "trialing";
  const effectivePlan: PlanTier = isActive ? plan : "free";

  await service.from("subscriptions").upsert(
    {
      id: subscription.id,
      user_id: userId,
      status,
      price_id: priceId,
      plan,
      current_period_start: new Date(
        (subscription as unknown as { current_period_start: number }).current_period_start * 1000,
      ).toISOString(),
      current_period_end: new Date(
        (subscription as unknown as { current_period_end: number }).current_period_end * 1000,
      ).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    },
    { onConflict: "id" },
  );

  await service
    .from("profiles")
    .update({ plan: effectivePlan })
    .eq("id", userId);
}

async function onInvoicePaid(
  event: Stripe.Event,
  service: ReturnType<typeof createSupabaseServiceClient>,
) {
  const invoice = event.data.object as Stripe.Invoice;

  // Resolve the customer directly from the invoice. We deliberately don't
  // route through `invoice.subscription` because that field was removed in
  // Stripe API v2025-04-30+ and moved to `invoice.parent.subscription_details`.
  // The customer is always present and is enough to find the user — their
  // `profile.plan` will already have been set by `syncSubscription` which
  // fires before `invoice.payment_succeeded` in the same delivery batch.
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) {
    console.warn("[webhook] invoice has no customer id");
    return;
  }

  const { data: profile } = await service
    .from("profiles")
    .select("id, plan, credits")
    .eq("stripe_customer_id", customerId)
    .single();
  if (!profile) {
    console.warn("[webhook] no profile for customer", customerId);
    return;
  }

  // Top up monthly credits at the start of every billing period.
  // Hard-set (not additive) — this is a subscription model where each
  // billing period grants a fresh allotment regardless of leftovers.
  const plan: PlanTier = profile.plan;
  const grant = PLANS[plan].monthlyCredits;
  if (grant > 0) {
    await service
      .from("profiles")
      .update({ credits: grant })
      .eq("id", profile.id);
    console.log(
      `[webhook] granted ${grant} credits to ${profile.id} (plan=${plan})`,
    );
  }
}

async function onInvoiceFailed(
  event: Stripe.Event,
  service: ReturnType<typeof createSupabaseServiceClient>,
) {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;

  // Soft-degrade: keep plan but log. Stripe will retry; if it eventually
  // moves the subscription to past_due / unpaid, syncSubscription handles it.
  console.warn("[stripe] invoice payment failed for customer", customerId);
}
