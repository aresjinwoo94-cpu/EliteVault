/** Moderation lifecycle. 'rejected' = declined by owner (never shown);
 *  'hidden' = kept but not currently public. Both are non-public. */
export type ReviewStatus = "pending" | "approved" | "hidden" | "rejected";

/** One photo attached to a review. `url` is the public URL; `path` is the
 *  object key inside the "screenshots" bucket (prefix reviews/) used to remove
 *  it from storage when it's removed from the review. */
export interface ReviewPhoto {
  url: string;
  path: string;
}

/**
 * A SNAPSHOT of the money-potential the analyzer already showed a reviewer's
 * account — never invented, always the same numbers they saw in their own
 * report. Filled owner-side by refreshReviewStats and stored on
 * reviews.potential_snapshot (migration 0029).
 *
 *   basis "meta_sim"    → current/potential are two REAL scenarios from their
 *                         most recent Meta simulation (e.g. conservative →
 *                         aggressive 7-day revenue, at their own AOV + budget).
 *                         `periodLabel` names the timeframe so nothing claims a
 *                         made-up "monthly" figure. `revenue` is the exact USD
 *                         the scenario card showed (integer, no fake decimals).
 *   basis "cr_scenario" → upside as an honest, modeled % range derived from
 *                         conversion-scenarios (score + niche) when no meta-sim
 *                         exists. Always caption it "estimate, not a promise".
 */
export interface PotentialSnapshot {
  currency: string;
  basis: "meta_sim" | "cr_scenario";
  /** Human timeframe for the money figures, e.g. "Meta projection · 7 days".
   *  Present for basis="meta_sim"; keeps the numbers from implying "monthly". */
  periodLabel?: string;
  current?: { label: string; revenue: number };
  potential?: { label: string; revenue: number };
  upsidePct?: { low: number; high: number };
  note?: string;
}

/** Public-facing review shape (no private fields — never `author_email`,
 *  `user_id`, `store_url`, etc.). `author_name` is the chosen display name.
 *  The verified-stats trio (audits_run / potential / verified) is only ever
 *  populated when the owner's `show_review_stats` switch is ON; otherwise it
 *  stays null/null/false and the card renders exactly as before 0029. */
export interface PublicReview {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  store_name: string | null;
  featured: boolean;
  created_at: string;
  photos: ReviewPhoto[];
  /** # of real audits the author account has run (null until verified). */
  audits_run: number | null;
  /** Money-potential snapshot, or null when unverified / no real data. */
  potential: PotentialSnapshot | null;
  /** True only when tied to an account with real analyses. */
  verified: boolean;
}

/** Full review row as the owner sees it (includes private + moderation data). */
export interface AdminReview extends PublicReview {
  author_email: string | null;
  store_url: string | null;
  status: ReviewStatus;
  approved_at: string | null;
}

/** The signed-in author's own review (for prefill / edit / delete). */
export interface MyReview {
  id: string;
  rating: number;
  body: string;
  display_name: string;
  store_name: string | null;
  store_url: string | null;
  status: ReviewStatus;
  created_at: string;
  photos: ReviewPhoto[];
}

export interface ReviewSettings {
  enabled: boolean;
  show_form: boolean;
  show_list: boolean;
  display_count: number;
  min_rating: number;
  auto_approve: boolean;
  heading: string | null;
  subheading: string | null;
  /** Owner master switch: may signed-in users add photos to their own review
   *  from the site? Default OFF. */
  allow_photos: boolean;
  /** Per-review photo cap (0–10). */
  max_photos: number;
  /** Owner master switch: show the verified badge + money mini-diagram + audit
   *  count publicly on review cards? Default OFF until the data is reviewed. */
  show_review_stats: boolean;
}

/** Defaults used when the settings row (or whole table) doesn't exist yet. */
export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  enabled: true,
  show_form: true,
  show_list: true,
  display_count: 6,
  min_rating: 1,
  auto_approve: false,
  heading: null,
  subheading: null,
  allow_photos: false,
  max_photos: 4,
  show_review_stats: false,
};
