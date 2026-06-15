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

/* ─── Momentum (Phase T1) ──────────────────────────────────────────────────
 * Derived purely from the weekly history ALREADY cached in `trend_signals` /
 * `products_trending` (the `week` column). No new data, no model calls, no
 * schema. Compares the latest cached week to the prior one to surface what's
 * moving — the "reason to log in this week".
 */

export type TrendStatus = "new" | "accelerating" | "cooling" | "sustained";

/** One item (sub-niche or product) enriched with its week-over-week story. */
export type TrendItemHistory = {
  item: string;
  kind: "subniche" | "product";
  direction: Direction;
  score: number;
  rationale: string | null;
  provenance: Provenance;
  source: string | null;
  week: string;
  /** Score per week, ascending — drives the sparkline. */
  series: { week: string; score: number }[];
  /** Score in the immediately-prior cached week, or null if the item is new. */
  prevScore: number | null;
  /** current − prior (null when new). */
  delta: number | null;
  status: TrendStatus;
};

export type NicheTrendHistory = {
  niche: NicheRow;
  week: string | null;
  /** The cached weeks in the window, ascending. */
  weeks: string[];
  subniches: TrendItemHistory[];
  products: TrendItemHistory[];
};

type FlatRow = {
  item: string;
  kind: "subniche" | "product";
  direction: Direction;
  score: number;
  rationale: string | null;
  provenance: Provenance;
  source: string | null;
  week: string;
};

function buildHistory(rows: FlatRow[], weeksAsc: string[]): TrendItemHistory[] {
  const currentWeek = weeksAsc[weeksAsc.length - 1];
  const priorWeek = weeksAsc.length >= 2 ? weeksAsc[weeksAsc.length - 2] : null;

  const byItem = new Map<string, FlatRow[]>();
  for (const r of rows) {
    const arr = byItem.get(r.item) ?? [];
    arr.push(r);
    byItem.set(r.item, arr);
  }

  const out: TrendItemHistory[] = [];
  for (const [item, itemRows] of byItem) {
    const cur = itemRows.find((r) => r.week === currentWeek);
    if (!cur) continue; // only surface items present in the latest cached week
    const scoreByWeek = new Map(itemRows.map((r) => [r.week, r.score]));
    const series = weeksAsc
      .filter((w) => scoreByWeek.has(w))
      .map((w) => ({ week: w, score: scoreByWeek.get(w) as number }));
    const prevScore =
      priorWeek != null && scoreByWeek.has(priorWeek)
        ? (scoreByWeek.get(priorWeek) as number)
        : null;
    const delta = prevScore != null ? cur.score - prevScore : null;
    let status: TrendStatus;
    if (prevScore == null) status = "new";
    else if (cur.score > prevScore) status = "accelerating";
    else if (cur.score < prevScore) status = "cooling";
    else status = "sustained";
    out.push({
      item,
      kind: cur.kind,
      direction: cur.direction,
      score: cur.score,
      rationale: cur.rationale,
      provenance: cur.provenance,
      source: cur.source,
      week: cur.week,
      series,
      prevScore,
      delta,
      status,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Latest cached trends for a niche PLUS the last `weeks` of history, enriched
 * with per-item momentum (status + week-over-week delta + score series).
 * Read-only over the existing cache.
 */
export async function getNicheTrendHistory(
  slug: string,
  weeks = 8,
): Promise<NicheTrendHistory | null> {
  const supabase = await createSupabaseServerClient();
  const { data: niche } = await supabase
    .from("niches")
    .select("id, slug, name, description")
    .eq("slug", slug)
    .single();
  if (!niche) return null;
  const n = niche as NicheRow;

  const [{ data: signals }, { data: products }] = await Promise.all([
    supabase
      .from("trend_signals")
      .select("item, kind, direction, score, rationale, provenance, source, week")
      .eq("niche_id", n.id)
      .order("week", { ascending: false }),
    supabase
      .from("products_trending")
      .select("product, direction, score, rationale, provenance, source, week")
      .eq("niche_id", n.id)
      .order("week", { ascending: false }),
  ]);

  const sigRows: FlatRow[] = ((signals as SignalRow[] | null) ?? []).map((r) => ({
    item: r.item,
    kind: r.kind,
    direction: r.direction,
    score: r.score,
    rationale: r.rationale,
    provenance: r.provenance,
    source: r.source,
    week: r.week,
  }));
  const prodRows: FlatRow[] = ((products as ProductRow[] | null) ?? []).map(
    (p) => ({
      item: p.product,
      kind: "product" as const,
      direction: p.direction,
      score: p.score,
      rationale: p.rationale,
      provenance: p.provenance,
      source: p.source,
      week: p.week,
    }),
  );

  // Latest N distinct weeks across both tables, ascending.
  const allWeeks = Array.from(
    new Set([...sigRows.map((r) => r.week), ...prodRows.map((r) => r.week)]),
  ).sort();
  const weeksAsc = allWeeks.slice(Math.max(0, allWeeks.length - weeks));
  const weekSet = new Set(weeksAsc);
  const currentWeek = weeksAsc.length
    ? weeksAsc[weeksAsc.length - 1]
    : null;

  if (!currentWeek) {
    return { niche: n, week: null, weeks: [], subniches: [], products: [] };
  }

  return {
    niche: n,
    week: currentWeek,
    weeks: weeksAsc,
    subniches: buildHistory(
      sigRows.filter((r) => weekSet.has(r.week)),
      weeksAsc,
    ),
    products: buildHistory(
      prodRows.filter((r) => weekSet.has(r.week)),
      weeksAsc,
    ),
  };
}

/* ─── Personalization (Phase T3) ───────────────────────────────────────────
 * Infer a user's likely niche from data we ALREADY have — no new table, no
 * `tracked_niches`, no model call. Pure keyword heuristic over their monitored
 * self-store domain and most-recent analysis (url + AI summary). Returns null
 * when nothing maps confidently, so the page falls back to the empty picker.
 *
 * The map is keyed by the active niche slugs; if the taxonomy changes it just
 * stops matching that slug (degrades to the empty-picker state) — never wrong.
 */
const NICHE_KEYWORDS: Record<string, string[]> = {
  "baby-kids": ["baby", "kids", "toddler", "nursery", "stroller", "diaper"],
  "coffee-tea": ["coffee", "espresso", "matcha", "tea"],
  "electronics-gadgets": ["electronics", "gadget", "headphone", "speaker", "charger", "smart home"],
  "fashion-apparel": ["fashion", "apparel", "clothing", "streetwear", "outfit", "dress"],
  "fitness-wellness": ["fitness", "workout", "gym", "yoga", "athletic", "wearable"],
  "gaming": ["gaming", "gamer", "console", "esports", "keyboard"],
  "home-kitchen": ["kitchen", "cookware", "appliance", "blender", "utensil"],
  "home-decor": ["decor", "furniture", "lighting", "candle", "interior"],
  "jewelry-accessories": ["jewelry", "jewellery", "necklace", "bracelet", "watch", "handbag"],
  "outdoor-camping": ["outdoor", "camping", "hiking", "tent", "backpack"],
  "pet-supplies": ["pet", "dog", "puppy", "kitten", "grooming", "leash"],
  "skincare-beauty": ["skincare", "serum", "cleanser", "cosmetic", "makeup", "moisturizer", "beauty"],
  "supplements-nutrition": ["supplement", "vitamin", "protein", "collagen", "nutrition", "gummies"],
  "sustainable-eco": ["sustainable", "reusable", "refill", "ethical", "bamboo", "zero waste"],
};

/** Whole-word (or phrase) match for PROSE so "ring" doesn't hit "offering". */
function wordHit(text: string, kw: string): boolean {
  if (kw.includes(" ")) return text.includes(kw);
  return new RegExp(`\\b${kw}\\b`, "i").test(text);
}

/** Lowercased hostname (no protocol/path) — domains concatenate words on
 *  purpose ("altexapparel"), so we substring-match them. */
function hostText(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Best-effort niche slug for a user, from existing data only. No model call. */
export async function inferUserNicheSlug(userId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const domains: string[] = [];
  const prose: string[] = [];

  // 1. Monitored self-store — the strongest intent signal.
  const { data: self } = await supabase
    .from("monitored_stores")
    .select("domain, url")
    .eq("user_id", userId)
    .eq("kind", "self")
    .limit(1);
  const s0 = (self as { domain: string | null; url: string | null }[] | null)?.[0];
  if (s0) domains.push(`${(s0.domain ?? "").toLowerCase()} ${hostText(s0.url)}`);

  // 2. Most recent analysis — domain + the AI summary prose.
  const { data: an } = await supabase
    .from("analyses")
    .select("url, result")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const a0 = (an as { url: string | null; result: { summary?: string } | null }[] | null)?.[0];
  if (a0) {
    domains.push(hostText(a0.url));
    prose.push((a0.result?.summary ?? "").toLowerCase());
  }

  const domainText = domains.join(" ");
  const proseText = prose.join(" ");
  if (!domainText.trim() && !proseText.trim()) return null;

  // Domain → substring (concatenated words); prose → whole-word.
  let best: { slug: string; hits: number } | null = null;
  for (const [slug, kws] of Object.entries(NICHE_KEYWORDS)) {
    let hits = 0;
    for (const kw of kws) {
      if (domainText.includes(kw) || (proseText && wordHit(proseText, kw))) {
        hits++;
      }
    }
    if (hits > 0 && (best === null || hits > best.hits)) best = { slug, hits };
  }
  return best?.slug ?? null;
}
