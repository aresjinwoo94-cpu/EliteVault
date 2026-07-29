import { redirect } from "next/navigation";
import { getOwner } from "@/lib/admin/guard";
import { OwnerMonitor } from "@/components/admin/owner-monitor";
import { OwnerReviews } from "@/components/admin/owner-reviews";
import { OwnerLibraryImages } from "@/components/admin/owner-library-images";
import {
  getAllReviewsForOwner,
  getReviewSettings,
  reviewsTablesReady,
} from "@/lib/reviews/data";
import { getLibraryImageAudit } from "@/lib/library/admin-images";

export const metadata = { title: "Monitor del dueño" };
export const dynamic = "force-dynamic";

/**
 * Panel privado del dueño de EliteVault: ingresos, suscripciones, embudo,
 * "casi pagan", suscripciones recientes y tráfico. Solo accesible para emails
 * en ADMIN_EMAILS / INTERNAL_EMAILS; cualquier otro usuario se redirige a /app.
 */
export default async function OwnerPage() {
  const owner = await getOwner();
  if (!owner) redirect("/app");

  const [settings, reviews, ready, libraryImages] = await Promise.all([
    getReviewSettings(),
    getAllReviewsForOwner(),
    reviewsTablesReady(),
    getLibraryImageAudit(),
  ]);

  return (
    <>
      <OwnerMonitor />
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 pb-16">
        <OwnerLibraryImages rows={libraryImages} />
        <OwnerReviews
          initialSettings={settings}
          initialReviews={reviews}
          tablesReady={ready}
        />
      </div>
    </>
  );
}
