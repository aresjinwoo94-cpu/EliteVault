import "server-only";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Teardown } from "@/lib/supabase/types";
import { parseNicheWinners, pickCompetitor, type StoredWinner } from "@/lib/analyzer/fix-tracks";

/**
 * The `competitor` track's data source, shared by the route (to generate) and by
 * the report pages (to decide whether the button is enabled at all).
 *
 * "none"  = the niche has no same-niche winner holding a teardown → honest
 *           empty state, the button renders disabled ("Coming soon for your niche").
 * "error" = the lookup itself failed → NOT the same as "none": callers must not
 *           treat a DB blip as an empty niche (the route answers 503; the page
 *           keeps the button enabled so nothing is hidden by a transient error).
 */
export type CompetitorResolution =
  | { ok: true; winner: StoredWinner; teardown: Teardown }
  | { ok: false; reason: "none" | "error" };

export async function resolveCompetitor(storedNicheWinners: unknown): Promise<CompetitorResolution> {
  // Never throws: the report pages await this, and a missing env / rejected fetch must
  // degrade to "error" (button stays enabled), not take the whole report down.
  try {
    return await resolve(storedNicheWinners);
  } catch {
    return { ok: false, reason: "error" };
  }
}

async function resolve(storedNicheWinners: unknown): Promise<CompetitorResolution> {
  const winners = parseNicheWinners(storedNicheWinners).filter((w) => w.exactMatch);
  if (winners.length === 0) return { ok: false, reason: "none" };
  const { data, error } = await createSupabaseServiceClient()
    .from("winning_sites")
    .select("domain, teardown")
    .in("domain", winners.map((w) => w.domain))
    .eq("status", "published")
    .not("teardown", "is", null);
  if (error) return { ok: false, reason: "error" };
  const teardowns = new Map<string, Teardown>();
  for (const r of (data ?? []) as unknown as { domain: string; teardown: Teardown | null }[]) {
    if (r.teardown?.elements?.length) teardowns.set(r.domain, r.teardown);
  }
  const pick = pickCompetitor(winners, teardowns);
  return pick ? { ok: true, winner: pick.winner, teardown: pick.teardown } : { ok: false, reason: "none" };
}
