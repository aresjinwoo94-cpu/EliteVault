"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the app chrome (topbar / mobile nav) on the payment route, on phones.
 *
 * Brief §5.1 — a checkout should not offer a menu full of ways to leave it.
 * On a phone the whole payment flow is one column, so the topbar is both an
 * exit and 56px of the little vertical space "Subscribe" has to fit in.
 *
 * Only below `md`: the desktop shell is unchanged, and the desktop sidebar is
 * already `hidden md:flex`, so the phone has nothing else to lose. The
 * checkout page draws its own minimal header (back link + "secure checkout"),
 * so the route is never left without a way back.
 *
 * Only the payment page itself — NOT /app/checkout/return, whose "activating
 * your plan" state has no navigation of its own and would strand a phone user
 * while it polls.
 *
 * `md:contents` makes this wrapper disappear from the layout at md and up, so
 * the topbar keeps its own `sticky` positioning against the original parent.
 */
export function HideChromeOnCheckout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const focused = pathname === "/app/checkout";
  return <div className={focused ? "hidden md:contents" : "contents"}>{children}</div>;
}
