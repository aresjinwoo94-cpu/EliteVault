/** Public-facing review shape (no private fields like author_email). */
export interface PublicReview {
  id: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string;
  featured: boolean;
  created_at: string;
}

/** Full review row as the owner sees it (includes private + moderation data). */
export interface AdminReview extends PublicReview {
  author_email: string | null;
  status: "pending" | "approved" | "hidden";
  approved_at: string | null;
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
