import type { Metadata } from "next";
import { reportUnlockEnabled } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How cancellation, access periods, plan changes, and refunds work for EliteVault subscriptions.",
  alternates: { canonical: "/legal/refunds" },
};

const LAST_UPDATED = "October 2026";
const CONTACT = "support@elitevaultapp.com";

export default function RefundsPage() {
  // The one-time report unlock (US$7) is only described while it is on sale (REPORT_UNLOCK).
  const unlock = reportUnlockEnabled();
  return (
    <>
      <p className="text-xs uppercase tracking-widest text-white/40">Legal</p>
      <h1 className="mt-1 font-serif text-3xl md:text-4xl tracking-tight text-white">
        Refund &amp; Cancellation Policy
      </h1>
      <p className="mt-2 text-sm text-white/40">Last updated: {LAST_UPDATED}</p>

      <div className="legal-prose mt-8">
        <p>
          EliteVault is a <strong>digital subscription service</strong>. This page
          explains how to cancel, what happens to your access, and our refund
          policy.
        </p>

        <h2>Cancel anytime</h2>
        <p>
          You can cancel your subscription at any time in two clicks from the
          Stripe Customer Portal (Billing &rarr; Manage subscription). There are no
          retention calls or cancellation fees. Once you cancel:
        </p>
        <ul>
          <li>Your subscription does not renew again.</li>
          <li>
            You keep access to your paid features until the{" "}
            <strong>end of the current billing period</strong> you&apos;ve already
            paid for.
          </li>
          <li>After that date, your account moves to the Free plan.</li>
        </ul>

        <h2>Refunds</h2>
        <p>
          Because EliteVault is a digital service delivered immediately,{" "}
          <strong>
            {unlock ? "subscription payments are" : "payments are"} non-refundable and all sales are final
          </strong>
          , including for partial or unused portions of a billing period. When you
          cancel, you are not charged again, but we do not refund the period
          already in progress.
        </p>

        {unlock && (
          <>
            <h2>One-time report unlock</h2>
            <p>
              You can unlock the full report of a single audit for a one-time payment of{" "}
              <strong>US$7</strong> (no subscription, nothing renews). This purchase is the
              exception to the rule above:{" "}
              <strong>
                you can ask for a refund by email within 7 days of the payment
              </strong>
              , no questions asked. Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from
              the account that paid, with the website audited. We refund the full amount to the
              original payment method through Stripe.
            </p>
            <ul>
              <li>
                When the refund is issued, that report <strong>locks again</strong>: the unlocked
                content (all fixes, the buyer-persona simulation, the fix tracks and the extra
                projection) is no longer available for that audit.
              </li>
              <li>
                The unlock applies to that one audit only. It is not a plan: it does not include new
                audits, publishing, the Optimizer or the full Library.
              </li>
              <li>
                Refunds requested after 7 days are at our discretion. Nothing here limits any
                non-waivable consumer right you may have.
              </li>
            </ul>
          </>
        )}

        <h2>Changing plans (proration)</h2>
        <p>
          If you upgrade or downgrade between paid plans mid-cycle, Stripe
          automatically <strong>prorates</strong> the difference and applies it to
          your next invoice. Proration applies only to plan changes — it is{" "}
          <strong>not</strong> a refund of a cancelled subscription.
        </p>

        <h2>Free plan</h2>
        <p>
          The Free plan involves no charge, so nothing needs to be cancelled or
          refunded.
        </p>

        <h2>Your statutory rights</h2>
        <p>
          Nothing in this policy limits any non-waivable rights you may have under
          applicable consumer-protection law in your jurisdiction. For example, if
          you are an EU/UK consumer, you may have a 14-day right of withdrawal for
          digital services; by starting to use the paid features right away, you
          ask us to begin immediately and acknowledge that the right may be lost
          once the service has been fully provided.
        </p>

        <h2>Questions</h2>
        <p>
          Need help with a charge or cancellation? Email{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we&apos;ll sort it out.
        </p>
      </div>
    </>
  );
}
