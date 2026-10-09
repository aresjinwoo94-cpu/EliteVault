/**
 * The dictionary namespaces CLIENT code reads through `useT()`.
 *
 * Only these (and only for the active language) are sent to the browser — see
 * `clientMessages()` in messages.ts. Shipping the whole dictionary in both
 * languages put ~30 KB gzipped on every page; most of it is read by Server
 * Components, which never need it in the browser.
 *
 * The list is split by WHERE it is needed so public pages stay light:
 *   • CORE — read by client code on public/marketing pages and the root chrome
 *     (nav, footer, support chat…); sent with the root layout on every page.
 *   • APP  — read only by the signed-in app and the report pages
 *     (components/i18n/app-scope.tsx mounts it in app/(app)/layout.tsx and the
 *     public report routes), so a landing/pricing/blog visit never downloads it.
 *
 * Add a namespace here when a "use client" component (or anything it imports)
 * starts reading it. scripts/tests/i18n-client-namespaces.test.ts walks the
 * client import graph and fails — printing the exact list — if this drifts in
 * either direction, so a missing entry can't reach production as raw keys.
 */
export const CORE_NAMESPACES = [
  "analyzerDemo",
  "anonGate",
  "auth",
  "authForm",
  "collage",
  "common",
  "compare",
  "contactForm",
  "errorPage",
  "features",
  "footer",
  "hero",
  "nav",
  "pills",
  "plans",
  "pricing",
  "reviewPhotos",
  "reviews",
  "social",
  "socialStrip",
  "supportChat",
  "twoPaths",
  "whoFor",
] as const;

export const APP_NAMESPACES = [
  "adReadiness",
  "analysisView",
  "analyzing",
  "annotations",
  "anonReveal",
  "apiKeys",
  "billing",
  "categories",
  "checkout",
  "commandMenu",
  "community",
  "fixTracks",
  "freeMeta",
  "gauges",
  "growthMap",
  "home",
  "launcher",
  "library",
  "libraryView",
  "lockedCure",
  "metaPromo",
  "nicheWinners",
  "optimizer",
  "paywall",
  "personaResponse",
  "report",
  "reportNav",
  "scaleLocked",
  "settingsPage",
  "share",
  "sidebar",
  "simulator",
  "siteCard",
  "topFixes",
  "topbar",
  "trendsBoard",
  "trendsPage",
] as const;

export const CLIENT_NAMESPACES = [...CORE_NAMESPACES, ...APP_NAMESPACES] as const;

export type ClientScope = "core" | "app";
