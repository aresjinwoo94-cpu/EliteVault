import "server-only";
import { cache } from "react";
import {
  MIN_REVIEWS_TO_SHOW,
  MIN_FOR_AGGREGATE,
} from "@/components/reviews/review-card";
import {
  getReviewSettings,
  getPublicReviews,
  getReviewStats,
} from "@/lib/reviews/data";

/**
 * Single source of truth for "will the landing's #reviews section render?".
 *
 * Both `Reviews` (the section) and `TrustBand` (the chip that links to it)
 * read this, so the chip can never point at an anchor that isn't there:
 *
 *   • master switch OFF, or list switch OFF  → hidden
 *   • fewer than MIN_REVIEWS_TO_SHOW (3) approved reviews → hidden
 *
 * Wrapped in React `cache` so the two callers share ONE round of queries per
 * request. `showAggregate` mirrors the section's own rule (stars/average only
 * from MIN_FOR_AGGREGATE reviews).
 */
export type ReviewsVisibility =
  | { show: false }
  | {
      show: true;
      settings: Awaited<ReturnType<typeof getReviewSettings>>;
      reviews: Awaited<ReturnType<typeof getPublicReviews>>;
      stats: Awaited<ReturnType<typeof getReviewStats>>;
      showAggregate: boolean;
    };

export const getReviewsVisibility = cache(async (): Promise<ReviewsVisibility> => {
  const settings = await getReviewSettings();
  if (!settings.enabled || !settings.show_list) return { show: false };

  const [reviews, stats] = await Promise.all([
    getPublicReviews(settings),
    getReviewStats(),
  ]);
  if (reviews.length < MIN_REVIEWS_TO_SHOW) return { show: false };

  return {
    show: true,
    settings,
    reviews,
    stats,
    showAggregate: stats.count >= MIN_FOR_AGGREGATE,
  };
});
