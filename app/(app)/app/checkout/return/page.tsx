import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, planFromPriceId } from "@/lib/stripe/plans";

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
  let credits = 0;

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
      credits = PLANS[plan].monthlyCredits;

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

  // ─── Render success ─────────────────────────────────────────────
  if (paid) {
    const planMeta = PLANS[plan];
    return (
      <div className="min-h-screen bg-obsidian-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          {/* Success animation */}
          <div className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-success/15 ring-2 ring-success/30">
            <CheckCircle2 className="size-10 text-success" />
            <div className="absolute -inset-2 rounded-full bg-success/20 blur-xl animate-pulse" />
          </div>

          <div>
            <Badge variant="gold" className="mx-auto">
              <Sparkles className="size-3" />
              Payment successful
            </Badge>
            <h1 className="mt-4 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
              Welcome to{" "}
              <span className="italic text-gold-gradient">
                {planMeta.name}
              </span>
              .
            </h1>
            <p className="mt-3 text-sm md:text-base text-white/60 leading-relaxed">
              Your subscription is active.{" "}
              <span className="text-white">{credits} credits</span> just landed
              in your account. Time to put them to work.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/app/analyzer">
              <Button size="lg" className="w-full sm:w-auto">
                Run your first analysis
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/app/billing">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                View billing
              </Button>
            </Link>
          </div>

          <p className="text-[11px] text-white/35 pt-4">
            A receipt is on its way to your email. Manage your subscription
            anytime from{" "}
            <Link href="/app/billing" className="text-champagne-400 hover:text-champagne-300">
              billing
            </Link>
            .
          </p>
        </div>
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
