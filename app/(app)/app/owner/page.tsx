import { redirect } from "next/navigation";
import { getOwner } from "@/lib/admin/guard";
import { OwnerMonitor } from "@/components/admin/owner-monitor";

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
  return <OwnerMonitor />;
}
