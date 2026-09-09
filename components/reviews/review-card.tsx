import { Star, Check } from "lucide-react";
import { ReviewPhotoGallery } from "@/components/reviews/review-photo-gallery";
import type { PotentialSnapshot, PublicReview } from "@/lib/reviews/types";

/**
 * Shared, read-only review UI. Extracted from components/marketing/reviews.tsx
 * so the landing section and the checkout section (components/billing/
 * checkout-reviews.tsx) render byte-identical cards from one definition —
 * same stars, same verified badge, same money mini-diagram, same honesty
 * caption. Fix a card here and both surfaces get it.
 *
 * These are presentational only: every owner switch (master / list / stats)
 * is enforced by the CALLER and by getPublicReviews(), which already nulls out
 * the verified trio when show_review_stats is OFF.
 */

/** `t` from getT()/useT() — passed in so this stays server/client agnostic. */
export type Translate = (key: string) => string;

/** Minimum approved sample before the credibility aggregate (avg + count) is
 *  shown — below this it isn't a meaningful statistic. Shared so the landing
 *  and the checkout can never drift apart on what counts as "enough". */
export const MIN_FOR_AGGREGATE = 5;

/**
 * Minimum number of APPROVED reviews before a testimonials block may appear at
 * all. An empty (or near-empty) block reads as "nobody has used this" — worse
 * than no section — so both surfaces hide entirely below this.
 */
export const MIN_REVIEWS_TO_SHOW = 3;

export function Stars({ value }: { value: number }) {
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

export function ReviewCard({
  review,
  t,
}: {
  review: PublicReview;
  t: Translate;
}) {
  // Locale-stable short date (mono) — avoids server/client hydration drift.
  const date = review.created_at
    ? new Date(review.created_at).toISOString().slice(0, 10)
    : "";
  // The enriched trio only appears on VERIFIED reviews (and only when the owner
  // switch is ON — getPublicReviews already nulls these out otherwise). With no
  // verified data the card is byte-for-byte what it was before 0029.
  const showStats = review.verified;
  return (
    <div className="glow-card flex flex-col rounded-2xl border border-white/[0.06] bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <Stars value={review.rating} />
        <div className="flex items-center gap-2">
          {showStats && (
            <span className="inline-flex items-center gap-1 rounded-full border border-champagne-400/30 bg-champagne-400/[0.08] px-2 py-0.5 text-[10px] font-medium text-champagne-300">
              <Check className="size-3" />
              {t("reviews.verified")}
            </span>
          )}
          {date && (
            <span className="font-mono text-xs tabular-nums text-white/30">
              {date}
            </span>
          )}
        </div>
      </div>
      {review.title && (
        <p className="mt-3 font-medium text-white leading-snug">{review.title}</p>
      )}
      <p className="mt-2 flex-1 text-sm text-white/60 leading-relaxed">
        {review.body}
      </p>
      <ReviewPhotoGallery photos={review.photos} authorName={review.author_name} />

      {showStats && (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          {review.audits_run != null && (
            <p className="font-mono text-[11px] tabular-nums text-white/50">
              {t("reviews.auditsRun").replace("{n}", String(review.audits_run))}
            </p>
          )}
          {review.potential && <PotentialDiagram p={review.potential} t={t} />}
        </div>
      )}

      <p className="mt-4 text-xs font-medium text-white/45">
        — {review.author_name}
        {review.store_name && (
          <span className="text-white/30"> · {review.store_name}</span>
        )}
      </p>
    </div>
  );
}

/** Money mini-diagram: "palitos y numeritos". Two honest shapes:
 *   • meta_sim    → real scenario revenue (low → high) the reviewer saw, with a
 *                   simple two-bar jump.
 *   • cr_scenario → a modeled conversion-upside % range.
 *  Both always carry the "estimate, not a promise" caption. */
export function PotentialDiagram({
  p,
  t,
}: {
  p: PotentialSnapshot;
  t: Translate;
}) {
  const money = (n: number) =>
    `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  if (p.basis === "meta_sim" && p.potential) {
    const hi = p.potential.revenue;
    const lo = p.current?.revenue ?? null;
    const loPct =
      lo != null && hi > 0 ? Math.max(8, Math.min(100, (lo / hi) * 100)) : null;
    return (
      <div className="mt-2.5">
        <div className="flex items-baseline gap-2 font-mono tabular-nums">
          {lo != null && (
            <>
              <span className="text-sm text-white/45">{money(lo)}</span>
              <span className="text-white/25">→</span>
            </>
          )}
          <span className="text-lg text-white">{money(hi)}</span>
        </div>
        <div className="mt-2 space-y-1">
          {loPct != null && (
            <div
              className="h-1.5 rounded-full bg-white/25"
              style={{ width: `${Math.round(loPct)}%` }}
            />
          )}
          <div className="h-1.5 w-full rounded-full bg-champagne-400/70" />
        </div>
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-white/35">
          {t("reviews.metaRange")}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          {t("reviews.modeledNote")}
        </p>
      </div>
    );
  }

  if (p.basis === "cr_scenario" && p.upsidePct) {
    const { low, high } = p.upsidePct;
    const pct = Math.max(8, Math.min(100, high));
    return (
      <div className="mt-2.5">
        <div className="font-mono text-lg tabular-nums text-white">
          +{low}%–{high}%
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-champagne-400/70"
            style={{ width: `${Math.round(pct)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] uppercase tracking-wider text-white/35">
          {t("reviews.upside")}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          {t("reviews.modeledNote")}
        </p>
      </div>
    );
  }

  return null;
}
