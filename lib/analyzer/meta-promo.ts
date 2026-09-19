/**
 * WP-4 — promoting the Meta Campaign Simulator in the report
 * (docs/analyzer-mejora-definitiva.md §3). Behind ANALYZER_META_PROMO.
 *
 * Pure rules the promo UI renders from. The UI receives only a tier: whether
 * the viewer can run the simulator is already decided server-side (canRunMeta),
 * and the locked preview is a fixed, clearly-labelled example — never numbers
 * derived from the viewer's audit.
 */

export type MetaPromoTier = "anon" | "free" | "pro" | "scale";

export function metaPromoTier(viewer: {
  isAnon: boolean;
  isPaid: boolean;
  isScale: boolean;
  canRunMeta: boolean;
}): MetaPromoTier {
  if (viewer.isAnon) return "anon";
  if (viewer.isScale) return "scale";
  if (viewer.canRunMeta) return "pro";
  return "free";
}

const PRO_CHECKOUT = "/app/checkout?plan=pro&interval=month";
export const SCALE_CHECKOUT = "/app/checkout?plan=scale&interval=month";

export type MetaPromoCta =
  | { kind: "upgrade"; href: string; targetPlan: "pro" }
  | { kind: "run" };

/**
 * Free and anonymous viewers are sold the simulator (Pro and up). An anonymous
 * visitor signs up through the same door as the register gate
 * (anon-register-gate.tsx): /app/analyzer is where the anonymous audit is
 * claimed into the new account (lib/anon/claim.ts), and it lands them back on
 * this report — now as Free, where the teaser links to Pro checkout. Sending
 * them straight to checkout would skip the claim and orphan the audit. Pro and
 * Scale already have the simulator, so their CTA takes them to it.
 */
export const ANON_SIGNUP_HREF = "/sign-up?next=/app/analyzer";

export function metaPromoCta(tier: MetaPromoTier): MetaPromoCta {
  switch (tier) {
    case "anon":
      return { kind: "upgrade", href: ANON_SIGNUP_HREF, targetPlan: "pro" };
    case "free":
      return { kind: "upgrade", href: PRO_CHECKOUT, targetPlan: "pro" };
    default:
      return { kind: "run" };
  }
}

/**
 * Brief §3 (B) — order by audience. A viewer who already pays for the
 * simulator shouldn't scroll past the whole free report to reach it; Free and
 * anonymous keep the narrative, ending at the wall.
 */
export function metaPromoMovesSectionUp(tier: MetaPromoTier): boolean {
  return tier === "pro" || tier === "scale";
}

export const META_PROMO_EVENTS = Object.freeze({
  view: "meta_promo_view",
  upgradeClick: "meta_promo_upgrade_click",
  runClick: "meta_promo_run_simulator_click",
} as const);

/**
 * The locked preview's example — the same demonstrative bands the existing
 * LockedSimulatorPreview uses. Frozen and shown with an "Example" label: it
 * shows the FORMAT of the output, not this store's projection.
 */
export const META_PROMO_SAMPLE = Object.freeze([
  Object.freeze({ key: "conservative", roas: "1.4x", spend: "$280", net: "$112", primary: false }),
  Object.freeze({ key: "balanced", roas: "2.1x", spend: "$350", net: "$385", primary: true }),
  Object.freeze({ key: "aggressive", roas: "2.8x", spend: "$525", net: "$945", primary: false }),
] as const);
