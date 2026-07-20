import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { DataPill } from "@/components/ui/data-pill";
import { ReviewForm } from "@/components/marketing/review-form";
import { getReviewSettings } from "@/lib/reviews/data";
import { getT } from "@/lib/i18n/server";

/**
 * Dedicated "Leave a review" route.
 *
 * The review form used to sit on the landing under "What founders say".
 * With no reviews yet, an empty form there reads as "nobody uses this" and
 * costs credibility — so the form was pulled out of the landing (see
 * components/marketing/reviews.tsx) and lives here instead, where it's
 * reached intentionally (linked post-audit / from the dashboard), not
 * stumbled into by a first-time visitor still deciding whether to trust us.
 *
 * The owner's master switch still governs it: if reviews are disabled or the
 * form is switched off in /app/owner, this page shows a graceful "closed"
 * message rather than a live form.
 */
export const metadata: Metadata = {
  title: "Leave a review — EliteVault",
  description:
    "Used EliteVault to audit your store? Share your honest experience — it helps other ecommerce founders decide.",
  alternates: { canonical: "/review" },
  // Not a page we want ranking; it's a utility route reached from the app.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const settings = await getReviewSettings();
  const formOpen = settings.enabled && settings.show_form;
  const { t } = await getT();

  return (
    <>
      <MarketingNav />
      <main className="relative">
        <section className="relative py-24 md:py-28">
          <div className="container max-w-2xl">
            <div className="flex flex-col items-center text-center">
              <DataPill items={["YOUR EXPERIENCE", "HONEST FEEDBACK"]} />
              <h1 className="mt-5 font-serif text-3xl md:text-4xl tracking-tight">
                {t("reviews.writeHeading")}
              </h1>
              <p className="mt-3 max-w-xl text-white/55 leading-relaxed">
                {t("reviews.pageSubheading")}
              </p>
            </div>

            <div className="mt-10">
              {formOpen ? (
                <ReviewForm />
              ) : (
                <div className="rounded-2xl border border-white/[0.06] bg-card p-8 text-center shadow-card">
                  <p className="text-sm text-white/60 leading-relaxed">
                    {t("reviews.closed")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
