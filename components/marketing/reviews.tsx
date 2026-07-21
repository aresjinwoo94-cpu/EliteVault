import { Star } from "lucide-react";
import {
  getReviewSettings,
  getPublicReviews,
  getReviewStats,
} from "@/lib/reviews/data";
import { getT } from "@/lib/i18n/server";
import type { PublicReview } from "@/lib/reviews/types";

/**
 * Minimum number of APPROVED reviews before the testimonials section is
 * allowed to appear on the landing. An empty (or near-empty) testimonials
 * block reads as "nobody has used this" — worse than having no section at
 * all — so we hide it entirely until there's genuine social proof.
 *
 * The "Leave a review" form no longer lives here: an empty form under a
 * "What founders say" heading is exactly the credibility leak we're
 * closing. The form moved to its own /review route (asked for post-audit,
 * where it makes sense). This component is now READ-ONLY social proof.
 */
const MIN_REVIEWS_TO_SHOW = 3;

/**
 * Public reviews section (landing). The owner controls it from /app/owner
 * and this component honors every switch:
 *
 *   • master OFF                → renders NOTHING.
 *   • list OFF                  → renders NOTHING (the form is gone).
 *   • fewer than 3 approved     → renders NOTHING (no empty-shell testimonials).
 *   • 3+ approved reviews       → the read-only list + rating summary.
 */
export async function Reviews() {
  const settings = await getReviewSettings();
  if (!settings.enabled || !settings.show_list) return null;

  const [reviews, stats] = await Promise.all([
    getPublicReviews(settings),
    getReviewStats(),
  ]);

  // Gate on real social proof: hide the whole section until we have at
  // least MIN_REVIEWS_TO_SHOW approved reviews.
  if (reviews.length < MIN_REVIEWS_TO_SHOW) return null;

  const { t } = await getT();
  const heading = settings.heading?.trim() || t("reviews.heading");
  const subheading = settings.subheading?.trim() || t("reviews.subheading");

  return (
    <section id="reviews" className="relative py-24 md:py-28">
      <div className="container max-w-5xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight">
              {heading}
            </h2>
            <p className="mt-3 text-white/55 leading-relaxed">{subheading}</p>
          </div>
          {stats.count > 0 && (
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                <Stars value={Math.round(stats.average)} />
                <span className="font-mono text-lg tabular-nums text-white">
                  {stats.average.toFixed(1)}
                </span>
                <span className="text-sm text-white/45">{t("reviews.outOf5")}</span>
              </div>
              <p className="mt-1 text-right text-xs text-white/40">
                {stats.count} {t("reviews.reviewsCount")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card">
      <Stars value={review.rating} />
      {review.title && (
        <p className="mt-3 font-medium text-white leading-snug">{review.title}</p>
      )}
      <p className="mt-2 flex-1 text-sm text-white/60 leading-relaxed">
        {review.body}
      </p>
      <p className="mt-4 text-xs font-medium text-white/45">
        — {review.author_name}
      </p>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= value
              ? "size-4 fill-champagne-400 text-champagne-400"
              : "size-4 text-white/15"
          }
        />
      ))}
    </div>
  );
}
