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

/** The checkout shows at most 3 — enough for social proof, not enough to
 *  crowd the purchase. */
const MAX_ON_CHECKOUT = 3;

/**
 * Reviews on the checkout page (brief §4).
 *
 * Same data, same owner switches and the SAME gates as the landing section —
 * there is no checkout-specific toggle and no new column:
 *
 *   • master OFF (`enabled`)     → renders NOTHING.
 *   • `show_list` OFF            → renders NOTHING.
 *   • fewer than 3 approved      → renders NOTHING.
 *   • tables missing             → getReviewSettings() fails closed (enabled:false).
 *
 * The verified badge / audit count / money mini-diagram follow
 * `show_review_stats` implicitly: getPublicReviews() already nulls that trio
 * out when the switch is OFF.
 *
 * It renders its OWN top separator so the checkout page can drop
 * <CheckoutReviews /> in unconditionally without leaving an orphan rule when
 * this returns null.
 */
export async function CheckoutReviews() {
  const settings = await getReviewSettings();
  if (!settings.enabled || !settings.show_list) return null;

  const [reviews, stats] = await Promise.all([
    getPublicReviews(settings),
    getReviewStats(),
  ]);
  if (reviews.length < MIN_REVIEWS_TO_SHOW) return null;

  const shown = reviews.slice(0, MAX_ON_CHECKOUT);
  const { t } = await getT();
  const heading = settings.heading?.trim() || t("checkout.reviewsHeading");

  return (
    <section className="mt-10 border-t border-white/[0.04] pt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
          {heading}
        </h2>
        {/* Credibility aggregate — only once there's a real sample (≥5). */}
        {stats.count >= MIN_FOR_AGGREGATE && (
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <Stars value={Math.round(stats.average)} />
              <span className="font-mono text-lg tabular-nums text-white">
                {stats.average.toFixed(1)}
              </span>
              <span className="text-sm text-white/45">
                {t("reviews.outOf5")}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs tabular-nums text-white/40 sm:text-right">
              {stats.count} {t("reviews.reviewsCount")}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (
          <ReviewCard key={r.id} review={r} t={t} />
        ))}
      </div>
    </section>
  );
}
