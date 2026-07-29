/** Moderation lifecycle. 'rejected' = declined by owner (never shown);
 *  'hidden' = kept but not currently public. Both are non-public. */
export type ReviewStatus = "pending" | "approved" | "hidden" | "rejected";

/** Public-facing review shape (no private fields — never `author_email`,
 *  `user_id`, `store_url`, etc.). `author_name` is the chosen display name. */
export interface PublicReview {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  store_name: string | null;
  featured: boolean;
  created_at: string;
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
};
