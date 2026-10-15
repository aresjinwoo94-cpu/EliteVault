import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAnalysisUnlocked } from "@/lib/unlocks/entitlement";

export const dynamic = "force-dynamic";

/** Polled by the unlock return page until the entitlement row exists (settlement is idempotent and fast). */
export async function GET(_req: Request, { params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const unlocked = await isAnalysisUnlocked(analysisId, user.id);
  return NextResponse.json({ unlocked }, { headers: { "Cache-Control": "no-store" } });
}
