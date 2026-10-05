"use client";

import { LazyMotion, domAnimation } from "framer-motion";

/**
 * framer-motion's full `motion` component ships every feature (drag, layout
 * animations…) to every page. Nothing in the site uses those, so components
 * import the lightweight `m` (aliased as `motion` at the import site) and this
 * provider supplies only the animation / gesture / viewport features they do
 * use. Loaded synchronously on purpose: hero entrance animations start from an
 * `opacity: 0` initial state, and fetching the features lazily would hold them
 * invisible a round-trip longer.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
