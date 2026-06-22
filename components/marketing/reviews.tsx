import { Star } from "lucide-react";
import {
  getReviewSettings,
  getPublicReviews,
  getReviewStats,
} from "@/lib/reviews/data";
import { getT } from "@/lib/i18n/server";
import { ReviewForm } from "./review-form";
import type { PublicReview } from "@/lib/reviews/types";

/**
 * Public reviews section. The owner controls everything from /app/owner, and
 * this component honors every switch — the way good review widgets should and
 * bad ones forget:
 *
 *   • master OFF        → renders NOTHING (no heading, no form, no list).
 *   • list OFF / empty  → the list (and its summary) simply doesn't appear.
 *   • form OFF          → no form.
 *   • nothing to show   → the whole section (incl. heading) is removed,
 *                          never an empty "No reviews yet" shell.
 */
export async function Reviews() {
  const settings = await getReviewSettings();
  if (!settings.enabled) return null;

  const [reviews, stats] = await Promise.all([
    settings.show_list ? getPublicReviews(settings) : Promise.resolve([]),
    settings.show_list ? getReviewStats() : Promise.resolve({ count: 0, average: 0 }),
  ]);

  const showList = settings.show_list && reviews.length > 0;
  const showForm = settings.show_form;

  // Nothing the owner wants public → no section at all (heading included).
  if (!showList && !showForm) return null;

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
          {showList && stats.count > 0 && (
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

        {showList && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        )}

        {showForm && (
          <div className="mx-auto mt-12 max-w-2xl">
            <ReviewForm />
          </div>
        )}
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
