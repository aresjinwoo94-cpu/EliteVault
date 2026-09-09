import { DataPill } from "@/components/ui/data-pill";
import {
  ReviewCard,
  Stars,
  MIN_FOR_AGGREGATE,
  MIN_REVIEWS_TO_SHOW,
} from "@/components/reviews/review-card";
import {
  getReviewSettings,
  getPublicReviews,
  getReviewStats,
} from "@/lib/reviews/data";
import { getT } from "@/lib/i18n/server";

/**
 * Public reviews section (landing). The owner controls it from /app/owner
 * and this component honors every switch:
 *
 *   • master OFF                → renders NOTHING.
 *   • list OFF                  → renders NOTHING (the form is gone).
 *   • fewer than 3 approved     → renders NOTHING (no empty-shell testimonials).
 *   • 3+ approved reviews       → the read-only list + rating summary.
 *
 * The "Leave a review" form no longer lives here: an empty form under a
 * "What founders say" heading is exactly the credibility leak we're closing.
 * The form moved to its own /review route (asked for post-audit, where it
 * makes sense). This component is now READ-ONLY social proof.
 *
 * The card/stars/mini-diagram markup lives in components/reviews/review-card.tsx
 * and is shared with the checkout's reviews section.
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
    <section id="reviews" className="section-y relative">
      <div className="container max-w-5xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <DataPill items={[t("reviews.pillLanding")]} />
            <h2 className="mt-5 font-serif text-3xl md:text-4xl tracking-tight">
              {heading}
            </h2>
            <p className="mt-3 text-white/55 leading-relaxed">{subheading}</p>
          </div>
          {/* Credibility aggregate — only once there's a real sample (≥5). */}
          {stats.count >= MIN_FOR_AGGREGATE && (
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                <Stars value={Math.round(stats.average)} />
                <span className="font-mono text-lg tabular-nums text-white">
                  {stats.average.toFixed(1)}
                </span>
                <span className="text-sm text-white/45">{t("reviews.outOf5")}</span>
              </div>
              <p className="mt-1 text-right font-mono text-xs tabular-nums text-white/40">
                {stats.count} {t("reviews.reviewsCount")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
