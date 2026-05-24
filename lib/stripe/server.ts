import "server-only";
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  // Don't crash dev if Stripe isn't configured yet — surface a clear error
  // only when something tries to use it.
  // eslint-disable-next-line no-console
  console.warn("[Stripe] STRIPE_SECRET_KEY missing; Stripe routes will 500");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "noop", {
  apiVersion: "2024-12-18.acacia",
  appInfo: {
    name: "EliteVault",
    version: "0.1.0",
  },
  typescript: true,
});
