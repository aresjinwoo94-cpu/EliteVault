import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe/server";
import { getCheckoutPriceId } from "@/lib/stripe/plans";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";

const Body = z.object({
  plan: z.enum(["pro", "scale"]),
  interval: z.enum(["month", "year"]),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { plan, interval } = parsed.data;

  const price = getCheckoutPriceId(plan, interval);
  if (!price) {
    return NextResponse.json(
      { error: "price_not_configured", detail: `Set STRIPE_PRICE_${plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "YEARLY"}` },
      { status: 500 },
    );
  }

  // Ensure Stripe customer exists (idempotent)
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await service
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: absoluteUrl("/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: absoluteUrl("/pricing?checkout=canceled"),
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan },
    },
    metadata: { supabase_user_id: user.id, plan },
  });

  return NextResponse.json({ url: session.url });
}
