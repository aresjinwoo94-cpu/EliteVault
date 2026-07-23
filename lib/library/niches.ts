/**
 * The canonical Library niche taxonomy.
 *
 * Lives in its own module — with NO `server-only` import — because three very
 * different consumers need it: React server components, the SEO niche pages,
 * and the CLI jobs in scripts/library/. Anything importing `server-only`
 * cannot be loaded by a plain tsx process, so keeping the taxonomy free of it
 * is what lets the jobs share one source of truth with the app instead of
 * re-declaring the list and drifting.
 *
 * `lib/library/niche-pages.ts` re-exports this for backwards compatibility —
 * existing imports from there keep working.
 */

/** Human labels + keyword phrasing per niche slug (DB `winning_sites.niche`). */
export const NICHE_LABELS: Record<string, { label: string; plural: string }> = {
  home: { label: "Home & Living", plural: "home & living brands" },
  apparel: { label: "Apparel", plural: "apparel brands" },
  beverage: { label: "Beverage", plural: "beverage brands" },
  skincare: { label: "Skincare", plural: "skincare brands" },
  accessories: { label: "Accessories", plural: "accessories brands" },
  beauty: { label: "Beauty", plural: "beauty brands" },
  footwear: { label: "Footwear", plural: "footwear brands" },
  fitness: { label: "Fitness", plural: "fitness brands" },
  wellness: { label: "Wellness", plural: "wellness brands" },
  eyewear: { label: "Eyewear", plural: "eyewear brands" },
  baby: { label: "Baby", plural: "baby brands" },
  pet: { label: "Pet", plural: "pet brands" },
  grooming: { label: "Grooming", plural: "grooming brands" },
};

/** Minimum published stores before a niche is worth showing on its own page. */
export const MIN_STORES = 3;
