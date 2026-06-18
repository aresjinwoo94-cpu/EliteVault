import { NextResponse } from "next/server";
import { getOwner } from "@/lib/admin/guard";
import * as ph from "@/lib/admin/posthog";
import { stripe } from "@/lib/stripe/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Diagnóstico del panel del dueño. Abre /api/admin/diag en el navegador (con tu
 * sesión de admin) y te dice qué está conectado y qué falla — sin exponer secretos.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // PostHog (tráfico)
  const cfg = ph.phConfig();
  const phTest = await ph.phTest();

  // Stripe (dinero)
  let stripeOk = true; let stripeDetail = "OK";
  try { await stripe.balance.retrieve(); } catch (e) { stripeOk = false; stripeDetail = (e as Error).message; }

  // Supabase (BD)
  let supaOk = true; let supaDetail = "OK"; let profilesCount = -1;
  try {
    const s = createSupabaseServiceClient();
    const { count, error } = await s.from("profiles").select("id", { count: "exact", head: true });
    if (error) { supaOk = false; supaDetail = error.message; } else { profilesCount = count ?? -1; }
  } catch (e) { supaOk = false; supaDetail = (e as Error).message; }

  return NextResponse.json(
    {
      you: owner.email,
      verdict: {
        dinero_real: stripeOk && supaOk,
        trafico_real: cfg.configured && phTest.ok,
        nota: cfg.configured && phTest.ok
          ? "Todo real (Stripe + Supabase + PostHog)."
          : "El tráfico (EN VIVO/dispositivos/fuentes) está en DEMO. Revisa 'posthog' abajo.",
      },
      posthog: {
        configurado: cfg.configured,
        apiKeySet: cfg.apiKeySet,
        projectIdSet: cfg.projectIdSet,
        host: cfg.host,
        test: phTest,
      },
      stripe: { ok: stripeOk, detail: stripeDetail },
      supabase: { ok: supaOk, detail: supaDetail, profilesCount },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
