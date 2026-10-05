/**
 * The dictionary namespaces CLIENT code reads through `useT()`.
 *
 * Only these (and only for the active language) are sent to the browser — see
 * `clientMessages()` in messages.ts. Shipping the whole dictionary in both
 * languages put ~30 KB gzipped on every page; most of it is read by Server
 * Components, which never need it in the browser.
 *
 * Add a namespace here when a "use client" component (or anything it imports)
 * starts reading it. scripts/tests/i18n-client-namespaces.test.ts walks the
 * client import graph and fails — printing the exact list — if this drifts in
 * either direction, so a missing entry can't reach production as raw keys.
 */
export const CLIENT_NAMESPACES = [
  "analyzerDemo",
  "anonGate",
  "anonReveal",
  "auth",
  "billing",
  "checkout",
  "compare",
  "faq",
  "features",
  "footer",
  "hero",
  "library",
  "metaPromo",
  "nav",
  "paywall",
  "plans",
  "pricing",
  "report",
  "reviews",
  "sidebar",
  "social",
  "socialStrip",
  "topbar",
  "twoPaths",
  "whoFor",
] as const;
