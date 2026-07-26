import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

/**
 * In-app subscription cancel / resume (no Stripe Portal round-trip).
 *
 * POST { action: "cancel" | "resume" }
 *   • cancel → sets cancel_at_period_end=true. The user keeps their plan until
 *     the current period ends, then the webhook's subscription.deleted handler
 *     downgrades them. Standard SaaS behaviour — no immediate loss of access.
 *   • resume → clears cancel_at_period_end (undo before the period ends).
 *
 * We update the local subscriptions row eagerly so the UI reflects instantly;
 * the customer.subscription.updated webhook re-syncs the same fields (idempotent).
 * The critical webhook + auth flows are untouched.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action === "resume" ? "resume" : "cancel";
    const cancelAtPeriodEnd = action === "cancel";

    // Latest subscription for this user (its id is the Stripe subscription id).
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const s = sub as { id?: string; status?: string } | null;
    if (!s?.id) {
      return NextResponse.json(
        {
          error: "no_subscription",
          detail: "No active subscription found on your account.",
        },
        { status: 400 },
      );
    }

    const updated = await stripe.subscriptions.update(s.id, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    // Eager local sync so the billing page reflects the change immediately.
    const service = createSupabaseServiceClient();
    await service
      .from("subscriptions")
      .update({ cancel_at_period_end: cancelAtPeriodEnd })
      .eq("id", s.id);

    return NextResponse.json({
      ok: true,
      action,
      cancel_at_period_end: updated.cancel_at_period_end,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "cancel_failed";
    const code = (err as { code?: string })?.code;
    const stripeMessage = (err as { raw?: { message?: string } })?.raw?.message;

    // Stale subscription id (Test→Live) — the sub we have on file doesn't
    // exist in the current mode. Point them at the portal/fresh checkout.
    if (code === "resource_missing") {
      return NextResponse.json(
        {
          error: "stale_subscription",
          detail:
            "We couldn't find that subscription in Stripe. Try 'Manage in Stripe', or start a fresh checkout.",
        },
        { status: 409 },
      );
    }

    console.error("[stripe/cancel] failed:", { msg, code, stripeMessage });
    return NextResponse.json(
      { error: code ?? "cancel_failed", detail: stripeMessage ?? msg },
      { status: 500 },
    );
  }
}
