import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Trends data layer (Phase 2). Reads are pulled from the weekly CACHE — no
 * model calls here, ever. The cron job (inngest/functions/refresh-trends.ts)
 * is the only writer.
 */

export type Direction = "up" | "down";
export type Provenance = "estimated" | "sourced";

export type NicheRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type SignalRow = {
  item: string;
  kind: "subniche" | "product";
  direction: Direction;
  score: number;
  rationale: string | null;
  provenance: Provenance;
  source: string | null;
  week: string;
};

export type ProductRow = {
  product: string;
  direction: Direction;
  score: number;
  rationale: string | null;
  provenance: Provenance;
  source: string | null;
  week: string;
};

/** Monday (UTC) of the ISO week containing `date`, as YYYY-MM-DD. */
export function mondayOf(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function currentWeekMonday(): string {
  return mondayOf(new Date());
}

export async function listNiches(): Promise<NicheRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("niches")
    .select("id, slug, name, description")
    .eq("is_active", true)
    .order("name");
  return (data as NicheRow[] | null) ?? [];
}

export type NicheTrends = {
  niche: NicheRow;
  week: string | null;
  subniches: SignalRow[];
  products: ProductRow[];
};

/**
 * Latest cached trends for a niche: the most recent week we have data for.
 * Returns empty arrays (with week=null) if the niche hasn't been refreshed
 * yet — the UI shows an honest "first data lands soon" state.
 */
export async function getNicheTrends(slug: string): Promise<NicheTrends | null> {
  const supabase = await createSupabaseServerClient();
  const { data: niche } = await supabase
    .from("niches")
    .select("id, slug, name, description")
    .eq("slug", slug)
    .single();
  if (!niche) return null;
  const n = niche as NicheRow;

  // Find the most recent week we have signals for, then read that week only.
  const { data: latest } = await supabase
    .from("trend_signals")
    .select("week")
    .eq("niche_id", n.id)
    .order("week", { ascending: false })
    .limit(1);
  const week = (latest as { week: string }[] | null)?.[0]?.week ?? null;

  if (!week) {
    return { niche: n, week: null, subniches: [], products: [] };
  }

  const [{ data: signals }, { data: products }] = await Promise.all([
    supabase
      .from("trend_signals")
      .select("item, kind, direction, score, rationale, provenance, source, week")
      .eq("niche_id", n.id)
      .eq("week", week)
      .order("score", { ascending: false }),
    supabase
      .from("products_trending")
      .select("product, direction, score, rationale, provenance, source, week")
      .eq("niche_id", n.id)
      .eq("week", week)
      .order("score", { ascending: false }),
  ]);

  return {
    niche: n,
    week,
    subniches: (signals as SignalRow[] | null) ?? [],
    products: (products as ProductRow[] | null) ?? [],
  };
}
