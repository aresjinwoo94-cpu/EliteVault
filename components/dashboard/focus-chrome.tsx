"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the app chrome (sidebar, topbar, mobile nav) on the payment route, at every size.
 *
 * Brief §5.1 — a checkout should not offer a menu full of ways to leave it.
 * On a phone the whole payment flow is one column, so the topbar is both an
 * exit and 56px of the little vertical space "Subscribe" has to fit in.
 *
 * Desktop included: the sidebar and topbar (Overview, Analyzer, Library, quick
 * search…) are all exits on a page whose only job is to take the payment. The
 * checkout page draws its own minimal header (back link + "secure checkout"),
 * so the route is never left without a way back.
 *
 * Only the payment page itself — NOT /app/checkout/return, whose "activating
 * your plan" state has no navigation of its own and would strand a phone user
 * while it polls.
 */
export function HideChromeOnCheckout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focused = pathname === "/app/checkout";
  return <div className={focused ? "hidden" : "contents"}>{children}</div>;
}
