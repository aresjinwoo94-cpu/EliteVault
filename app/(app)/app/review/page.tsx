import { DataPill } from "@/components/ui/data-pill";
import { UserReviewForm } from "@/components/reviews/user-review-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReviewSettings, getMyReview } from "@/lib/reviews/data";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Leave a review" };
export const dynamic = "force-dynamic";

/**
 * Signed-in review submission (inside the app shell → auth-gated by the (app)
 * layout). Prefills the display name from the profile, loads the user's
 * existing review (edit-in-place), and honors the owner's master switches.
 */
export default async function AppReviewPage() {
  const { t } = await getT();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const settings = await getReviewSettings();
  const formOpen = settings.enabled && settings.show_form;

  let defaultName = "";
  let existing = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    defaultName =
      (profile as { full_name?: string } | null)?.full_name ||
      user.email?.split("@")[0] ||
      "";
    existing = await getMyReview(user.id);
  }

  return (
    <div className="mx-auto max-w-2xl p-6 pt-10 md:p-10 md:pt-14">
      <div className="flex flex-col items-center text-center">
        <DataPill items={[t("reviews.pill1"), t("reviews.pill2")]} />
        <h1 className="mt-5 font-serif text-3xl tracking-tight md:text-4xl">
          {existing ? t("reviews.editHeading") : t("reviews.writeHeading")}
        </h1>
        <p className="mt-3 max-w-xl leading-relaxed text-white/55">
          {t("reviews.pageSubheading")}
        </p>
      </div>

      <div className="mt-10">
        {formOpen ? (
          <UserReviewForm
            defaultName={defaultName}
            existing={existing}
            allowPhotos={settings.enabled && settings.allow_photos}
            maxPhotos={settings.max_photos}
          />
        ) : (
          <div className="rounded-2xl border border-white/[0.06] bg-card p-8 text-center shadow-card">
            <p className="text-sm leading-relaxed text-white/60">
              {t("reviews.closed")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
