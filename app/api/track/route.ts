import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Beacon de analítica first-party. El cliente (components/analytics/page-tracker)
 * lo llama en cada cambio de página. Registra la visita en `page_views` con geo
 * (cabeceras de Vercel) y dispositivo. Público (acepta visitantes anónimos) pero
 * solo INSERTA vía service role. Nunca devuelve datos.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deviceFromUA(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "Tablet";
  if (/mobi|iphone|android.*mobile/i.test(ua)) return "Móvil";
  return "Escritorio";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { path?: string; referrer?: string };
    const ua = req.headers.get("user-agent") || "";
    const country = req.headers.get("x-vercel-ip-country");
    const cityRaw = req.headers.get("x-vercel-ip-city");
    const city = cityRaw ? decodeURIComponent(cityRaw) : null;
    const host = (req.headers.get("host") || "").replace(/^www\./, "");

    let referrer_domain = "Directo";
    try {
      if (body.referrer) {
        const h = new URL(body.referrer).hostname.replace(/^www\./, "");
        if (h && h !== host) referrer_domain = h;
      }
    } catch { /* referrer inválido → Directo */ }

    let anon = req.cookies.get("ev_anon")?.value;
    const res = new NextResponse(null, { status: 204 });
    if (!anon) {
      anon = crypto.randomUUID();
      res.cookies.set("ev_anon", anon, { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", path: "/", secure: true });
    }

    const supa = createSupabaseServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supa.from("page_views").insert({
      anon_id: anon,
      path: (body.path || "").slice(0, 300) || null,
      referrer_domain,
      country: country || null,
      city,
      device: deviceFromUA(ua),
    } as any);

    return res;
  } catch {
    return new NextResponse(null, { status: 204 }); // nunca rompe la navegación
  }
}
