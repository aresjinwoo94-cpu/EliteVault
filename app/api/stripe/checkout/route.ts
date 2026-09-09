import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createEmbeddedCheckoutSession } from "@/lib/stripe/checkout-session";

const Body = z.object({
  plan: z.enum(["pro", "scale"]),
  interval: z.enum(["month", "year"]),
});

/**
 * Embedded Checkout session endpoint.
 *
 * The session-building logic moved to lib/stripe/checkout-session.ts so the
 * /app/checkout page can start the same work during its SERVER render instead
 * of waiting for the client to hydrate and fetch. This route keeps its exact
 * request/response contract for any caller that still wants the HTTP path.
 *
 * createEmbeddedCheckoutSession never throws — it returns a discriminated
 * union — so the previous catch-all that turned Stripe SDK throws into empty
 * 500s (and "Unexpected end of JSON input" on the client) is no longer needed
 * here; the same logging and error shape live in the shared module.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { plan, interval } = parsed.data;

  const result = await createEmbeddedCheckoutSession({
    userId: user.id,
    userEmail: user.email ?? null,
    plan,
    interval,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  return NextResponse.json({ client_secret: result.clientSecret });
}
