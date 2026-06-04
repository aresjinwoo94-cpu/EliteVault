import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "How cancellation, access periods, plan changes, and refunds work for EliteVault subscriptions.",
};

const LAST_UPDATED = "June 2026";
const CONTACT = "support@elitevaultapp.com";

export default function RefundsPage() {
  return (
    <>
      {/* TODO: revisión legal profesional antes de producción */}
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
            payments are non-refundable and all sales are final
          </strong>
          , including for partial or unused portions of a billing period. When you
          cancel, you are not charged again, but we do not refund the period
          already in progress.
        </p>

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
          applicable consumer-protection law in your jurisdiction.{" "}
          <strong>
            [Confirmar derechos de desistimiento/consumo aplicables con asesoría.]
          </strong>
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
