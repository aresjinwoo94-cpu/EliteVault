import Link from "next/link";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PlanCard } from "@/components/billing/plan-card";
import { PortalButton } from "@/components/billing/portal-button";
import { PLANS } from "@/lib/stripe/plans";

export const metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const sp = await searchParams;
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
