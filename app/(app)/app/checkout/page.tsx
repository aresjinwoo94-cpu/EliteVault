import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Lock,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { PLANS, type PlanTier, type Interval } from "@/lib/stripe/plans";
import { EmbeddedCheckoutForm } from "@/components/billing/embedded-checkout";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

/**
 * Custom Embedded Checkout page (v3.8.3).
 *
 * Layout:
 *   LEFT (40%)  — plan summary card with our dark theme, brand fonts,
 *                 selected plan + price + feature list. This is OURS,
 *                 so it can be as fancy as we want.
 *   RIGHT (60%) — EmbeddedCheckoutForm — the Stripe iframe in a white
 *                 frame. Stripe owns the payment fields (PCI). We own
 *                 the page chrome.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const sp = await searchParams;
  const planId = sp.plan as PlanTier | undefined;
  const interval = (sp.interval as Interval | undefined) ?? "month";

  // Validate plan & interval
  if (!planId || planId === "free" || !PLANS[planId]) {
    redirect("/pricing");
  }
  if (interval !== "month" && interval !== "year") {
    redirect("/pricing");
  }

  // Auth check — checkout requires a logged-in user
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/app/checkout?plan=${planId}&interval=${interval}`)}`,
    );
  }

  const plan = PLANS[planId];
  const price = plan.price[interval];

  return (
    <div className="min-h-screen bg-obsidian-950">
      {/*
        Warm up the TCP/TLS connections to Stripe BEFORE the embedded iframe
        starts loading. The form does an API round-trip then mounts an iframe
        from js.stripe.com → this shaves the DNS+TLS handshake off the
        critical path so the payment form paints sooner. (React 19 hoists
        these to <head>.)
      */}
      <link rel="preconnect" href="https://js.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://api.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://checkout.stripe.com" crossOrigin="" />
      <link rel="preconnect" href="https://m.stripe.network" crossOrigin="" />

      {/* Top bar — back link + brand */}
      <header className="border-b border-white/[0.04] bg-obsidian-900/40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/app/billing"
            className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to billing
          </Link>
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/30">
            <Lock className="size-3" />
            Secure checkout · Stripe
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 md:py-14">
        <div className="grid lg:grid-cols-[5fr_7fr] gap-8 items-start">
          {/* LEFT — plan summary in our dark theme */}
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/40">
                You're upgrading to
              </p>
              <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
                EliteVault {plan.name}
              </h1>
            </div>

            {/* Pricing card */}
            <div className="rounded-2xl border border-champagne-400/20 bg-champagne-400/[0.03] p-6 relative overflow-hidden">
              <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-champagne-400/15 blur-3xl" />
              <div className="relative">
                <div className="flex items-baseline gap-2">
                  <Badge variant="gold">
                    <Sparkles className="size-3" />
                    {plan.name}
                  </Badge>
                  <span className="text-[10px] text-white/40 uppercase tracking-widest ml-auto">
                    {interval === "month" ? "Monthly billing" : "Annual billing"}
                  </span>
                </div>

                <div className="mt-5 flex items-baseline gap-2">
                  <span className="font-serif text-5xl text-gold-gradient tnum">
                    {formatCurrency(price)}
                  </span>
                  <span className="text-sm text-white/45">
                    / {interval === "month" ? "month" : "year"}
                  </span>
                </div>

                {interval === "year" && (
                  <p className="mt-1 text-[11px] text-success">
                    Save vs monthly · 20% off
                  </p>
                )}

                <p className="mt-4 text-sm text-white/65 leading-relaxed">
                  {plan.description}
                </p>
              </div>
            </div>

            {/* What's included */}
            <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5">
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-3">
                What you get
              </p>
              <ul className="space-y-2.5">
                {plan.features
                  .filter((f) => f.included)
                  .slice(0, 6)
                  .map((f) => (
                    <li
                      key={f.text}
                      className="flex items-start gap-2.5 text-sm text-white/80"
                    >
                      <Check
                        className={`size-3.5 shrink-0 mt-0.5 ${
                          f.highlight ? "text-champagne-400" : "text-success"
                        }`}
                      />
                      <span className={f.highlight ? "text-white" : ""}>
                        {f.text}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Trust footer */}
            <div className="grid grid-cols-2 gap-3 text-[11px] text-white/45">
              <div className="flex items-center gap-2">
                <Shield className="size-3.5 text-white/30" />
                Cancel anytime
              </div>
              <div className="flex items-center gap-2">
                <Zap className="size-3.5 text-white/30" />
                Credits load instantly
              </div>
            </div>
          </div>

          {/* RIGHT — Stripe Embedded Checkout */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-3">
              Payment
            </p>
            <EmbeddedCheckoutForm plan={planId} interval={interval} />
            <p className="mt-4 text-[11px] text-white/30 text-center leading-relaxed">
              Payment is processed by Stripe. EliteVault never sees or stores
              your card details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
