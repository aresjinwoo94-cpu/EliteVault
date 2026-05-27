import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Current-user JSON endpoint (v3.8.4).
 *
 * Returns the authenticated user's plan + credits. Used by client-side
 * polling on the post-checkout return page (PlanConfirmation component)
 * to detect when the upgrade lands in the DB even if the server-rendered
 * page caught a stale read.
 *
 * Returns 401 if not signed in. No-store cache so each poll re-fetches.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, credits")
    .eq("id", user.id)
    .single();

  return NextResponse.json(
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plan: (profile as any)?.plan ?? "free",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credits: (profile as any)?.credits ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
