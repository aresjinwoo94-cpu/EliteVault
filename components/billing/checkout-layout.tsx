import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Check, Lock, Sparkles, Shield, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
// PlanTier comes from the DB types — lib/stripe/plans imports it too but
// doesn't re-export it, so taking it from there resolves to `any` and the
// PLANS lookup below loses its type.
import { PLANS, type Interval, type PlanFeature } from "@/lib/stripe/plans";
import type { PlanTier } from "@/lib/supabase/types";
import { ResultsBars } from "@/components/billing/results-bars";
import { PaymentMethods } from "@/components/billing/payment-methods";
import { CheckoutReviews } from "@/components/billing/checkout-reviews";
import { formatCurrency } from "@/lib/utils";

/**
 * The checkout page's chrome and plan summary, around a payment slot.
 *
 * Extracted from the page so the markup has ONE source of truth: the page
 * owns auth and the Stripe session, this owns what the buyer sees. The
 * payment panel is a slot because it is the only part that needs the live
 * session.
 *
 * Phone layout (brief §5): the buyer already clicked "upgrade", so the form
 * comes first and the plan summary follows it; the header, the pricing card
 * and the price line are not repeated; the app chrome is hidden
 * (components/dashboard/focus-chrome.tsx). Desktop keeps the original
 * two-column layout, order and spacing.
 */
export function CheckoutLayout({
  planId,
  interval,
  payment,
}: {
  planId: Exclude<PlanTier, "free">;
  interval: Interval;
  /** The live Stripe panel, or a stand-in when previewing the layout. */
  payment: ReactNode;
}) {
  const plan = PLANS[planId];
  const price = plan.price[interval];

  return (
    <div className="min-h-screen bg-obsidian-950">
      {/* Top bar — back link + brand. This is the only navigation on the
          payment route for a phone, so it is never hidden. */}
      <header className="border-b border-white/[0.04] bg-obsidian-900/40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/app/billing"
            className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to billing
          </Link>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/30">
            <Lock className="size-3" />
            Secure checkout · Stripe
          </div>
        </div>
      </header>

      {/* §5.2 — less dead space above the form on a phone; desktop keeps its
          original breathing room. */}
      <div className="max-w-6xl mx-auto px-6 py-6 md:py-14">
        <div className="grid lg:grid-cols-[5fr_7fr] gap-8 items-start">
          {/* LEFT — plan summary in our dark theme.
              §5.2 — on a phone this whole column moves BELOW the payment form:
              someone who clicked "upgrade" has already decided, so the form
              they came for should not sit under a screen of marketing. */}
          <div className="order-2 space-y-6 lg:order-1">
            {/* §5.3 — the phone gets the compact version of this next to the
                form instead; two "You're upgrading to EliteVault Pro" blocks
                in one column read as a rendering bug. */}
            <div className="hidden lg:block">
              <p className="text-xs uppercase tracking-widest text-white/40">
                You&apos;re upgrading to
              </p>
              <h1 className="mt-2 font-serif text-4xl md:text-5xl tracking-tight leading-[1.05]">
                EliteVault {plan.name}
              </h1>
            </div>

            {/* Pricing card — also the phone's duplicate: the plan and price
                are in the compact header AND inside Stripe's own summary. */}
            <div className="relative hidden overflow-hidden rounded-2xl border border-champagne-400/20 bg-champagne-400/[0.03] p-6 lg:block">
              <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-champagne-400/15 blur-3xl" />
              <div className="relative">
                <div className="flex items-baseline gap-2">
                  <Badge variant="gold">
                    <Sparkles className="size-3" />
                    {plan.name}
                  </Badge>
                  <span className="text-[11px] text-white/40 uppercase tracking-widest ml-auto">
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
                  <p className="mt-1 text-xs text-success">Save vs monthly · 20% off</p>
                )}

                <p className="mt-4 text-sm text-white/65 leading-relaxed">
                  {plan.description}
                </p>
              </div>
            </div>

            {/* What's included */}
            <div className="rounded-2xl border border-white/[0.06] bg-card/40 p-5">
              <p className="text-[11px] uppercase tracking-widest text-white/40 mb-3">
                What you get
              </p>
              <ul className="space-y-2.5">
                {plan.features
                  .filter((f: PlanFeature) => f.included)
                  .slice(0, 6)
                  .map((f: PlanFeature) => (
                    <li
                      key={f.text}
                      className="flex items-start gap-2.5 text-sm text-white/80"
                    >
                      <Check
                        className={`size-3.5 shrink-0 mt-0.5 ${
                          f.highlight ? "text-champagne-400" : "text-success"
                        }`}
                      />
                      <span className={f.highlight ? "text-white" : ""}>{f.text}</span>
                    </li>
                  ))}
              </ul>
            </div>

            {/* Survey proof — self-reported, always captioned as an estimate. */}
            <ResultsBars />

            {/*
              Trust footer. Previously a `grid grid-cols-2`, which forced two
              equal columns onto two very unequal strings — leaving a big gap
              after "Cancel anytime", and letting "Credits load instantly" wrap
              under its own vertically-centred icon. Sizing each item to its
              content and pinning the icon to the first text line keeps them
              aligned at every width.
            */}
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs text-white/45">
              <span className="inline-flex items-start gap-2">
                <Shield className="size-3.5 shrink-0 mt-px text-white/30" />
                Cancel anytime
              </span>
              <span className="inline-flex items-start gap-2">
                <Zap className="size-3.5 shrink-0 mt-px text-white/30" />
                Credits load instantly
              </span>
            </div>

            {/* Accepted methods — our own chrome, outside Stripe's iframe.
                Sits with the rest of the reassurance copy in this column. */}
            <PaymentMethods />
          </div>

          {/* RIGHT — the payment panel. First in the visual order on a phone
              (§5.2) so "Subscribe" is about one scroll away. */}
          <div className="order-1 lg:order-2">
            {/* The phone's replacement for the left column's header + pricing
                card: plan and price in one line, above the form. */}
            <div className="mb-4 flex items-baseline justify-between gap-3 lg:hidden">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-widest text-white/40">
                  You&apos;re upgrading to
                </p>
                <p className="truncate font-serif text-xl leading-tight sm:text-2xl">
                  EliteVault {plan.name}
                </p>
              </div>
              <p className="shrink-0 text-right">
                <span className="font-serif text-xl text-gold-gradient tnum sm:text-2xl">
                  {formatCurrency(price)}
                </span>
                <span className="text-xs text-white/45">
                  /{interval === "month" ? "mo" : "yr"}
                </span>
                {/* The annual saving lives in the desktop-only pricing card,
                    so without this a phone buyer never sees why annual. */}
                {interval === "year" && (
                  <span className="block text-[11px] text-success">20% off</span>
                )}
              </p>
            </div>
            <p className="mb-3 hidden text-[11px] uppercase tracking-widest text-white/40 lg:block">
              Payment
            </p>
            {payment}
            <p className="mt-4 text-xs text-white/30 text-center leading-relaxed">
              Payment is processed by Stripe. EliteVault never sees or stores your
              card details.
            </p>
          </div>
        </div>

        {/* Social proof — renders its own separator, or nothing at all when
            the owner's switches / the 3-review floor say so. */}
        <CheckoutReviews />
      </div>
    </div>
  );
}
