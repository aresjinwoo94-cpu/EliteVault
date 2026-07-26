import "server-only";
import { stripe } from "./server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Resolve a Stripe customer id that is valid in the CURRENT Stripe mode,
 * auto-healing a stale/missing stored id — the classic Test→Live footgun that
 * surfaced as `stale_customer` in the portal and blocked plan changes/cancels.
 *
 *   1. If the stored id still resolves in Stripe, use it.
 *   2. Otherwise look the customer up by email, preferring one with a live
 *      (active/trialing/past_due) subscription, and persist the healed id back
 *      to the profile so future calls skip the lookup.
 *   3. If nothing is found, return null (caller prompts a fresh checkout).
 *
 * Mirrors the auto-heal the checkout route already does when creating sessions,
 * so every billing entry point tolerates a stale customer id the same way.
 */
export async function resolveStripeCustomerId(opts: {
  userId: string;
  email: string | null;
  storedId: string | null;
}): Promise<string | null> {
  const { userId, email, storedId } = opts;

  // 1. Trust the stored id only if it actually exists in this mode.
  if (storedId) {
    try {
      const existing = await stripe.customers.retrieve(storedId);
      if (!(existing as { deleted?: boolean }).deleted) return storedId;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      // Anything other than "no such customer" is a real error — rethrow.
      if (code !== "resource_missing") throw err;
      // else fall through to the email lookup below
    }
  }

  if (!email) return null;

  // 2. Find by email; prefer a customer that has a real subscription.
  const list = await stripe.customers.list({ email, limit: 20 });
  if (list.data.length === 0) return null;

  let chosen = list.data[0];
  for (const c of list.data) {
    const subs = await stripe.subscriptions.list({
      customer: c.id,
      status: "all",
      limit: 10,
    });
    if (
      subs.data.some((s) =>
        ["active", "trialing", "past_due"].includes(s.status),
      )
    ) {
      chosen = c;
      break;
    }
  }

  // 3. Persist the healed id so we don't re-scan every time.
  if (chosen.id !== storedId) {
    const service = createSupabaseServiceClient();
    await service
      .from("profiles")
      .update({ stripe_customer_id: chosen.id })
      .eq("id", userId);
  }

  return chosen.id;
}
