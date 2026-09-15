/**
 * The payment methods Embedded Checkout offers — the single source of truth.
 *
 * lib/stripe/checkout-session.ts creates every Checkout Session with exactly
 * this list, and every "we accept" badge row (components/billing/payment-marks)
 * derives the brands it draws from it. So a brand can't be advertised unless
 * its method is enabled here, and removing a method here removes its badges.
 *
 * Deliberately import-free: the marketing footer is a client component and
 * imports this through the badge row, so nothing server-side may come along.
 *
 * "card" covers Visa / Mastercard / Amex / Discover (and Diners / JCB, which we
 * don't badge). Apple Pay / Google Pay surface inside Stripe's iframe through
 * "card" when the visitor's browser supports them; they are not methods we can
 * promise every visitor, so they are not badged either.
 */
export const CHECKOUT_PAYMENT_METHOD_TYPES = [
  "card",
  "amazon_pay",
  "cashapp",
  "link",
] as const;

export type CheckoutPaymentMethodType =
  (typeof CHECKOUT_PAYMENT_METHOD_TYPES)[number];
