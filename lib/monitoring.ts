import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Monitor data layer (retention pass). READ-ONLY over the existing tables —
 * `monitored_stores` and the weekly `score_snapshots` history. No writes (the
 * Inngest weekly-reaudit job stays the only writer), no model calls, no schema.
 */

export type MonitorKind = "self" | "competitor";

export type MonitoredStore = {
  id: string;
  url: string;
  domain: string;
  label: string | null;
  kind: MonitorKind;
  last_score: number | null;
  last_audited_at: string | null;
};

/** A store joined to its weekly score history + derived stats. */
export type StoreOverview = MonitoredStore & {
  /** Score per week, ascending — drives the sparkline. */
  series: { week: string; score: number }[];
  /** Latest known score (newest snapshot, else last_score). */
  current: number | null;
  /** Prior-week snapshot score, if any. */
  prevScore: number | null;
  /** current − prevScore (null when no prior week). */
  delta: number | null;
  best: number | null;
  worst: number | null;
};

export type MonitorOverview = {
  self: StoreOverview | null;
  competitors: StoreOverview[];
  /** Union of weeks across all stores, ascending. */
  weeks: string[];
};

type SnapshotRow = {
  monitored_store_id: string;
  score: number;
  week: string;
};

function overviewFor(
  store: MonitoredStore,
  snaps: SnapshotRow[],
  weeks: number,
): StoreOverview {
  const series = snaps
    .filter((s) => s.monitored_store_id === store.id)
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0))
    .map((s) => ({ week: s.week, score: s.score }))
    .slice(-weeks);

  const scores = series.map((p) => p.score);
  const current =
    scores.length > 0 ? scores[scores.length - 1] : store.last_score;
  const prevScore = scores.length >= 2 ? scores[scores.length - 2] : null;
  const delta = current != null && prevScore != null ? current - prevScore : null;
  const best = scores.length > 0 ? Math.max(...scores) : store.last_score;
  const worst = scores.length > 0 ? Math.min(...scores) : store.last_score;

  return { ...store, series, current, prevScore, delta, best, worst };
}

/** Each monitored store + its ~`weeks` of score history and derived stats. */
export async function getMonitorOverview(
  userId: string,
  weeks = 12,
): Promise<MonitorOverview> {
  const supabase = await createSupabaseServerClient();

  const [{ data: storeRows }, { data: snapRows }] = await Promise.all([
    supabase
      .from("monitored_stores")
      .select("id, url, domain, label, kind, last_score, last_audited_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("score_snapshots")
      .select("monitored_store_id, score, week")
      .eq("user_id", userId)
      .order("week", { ascending: true }),
  ]);

  const stores = (storeRows as MonitoredStore[] | null) ?? [];
  const snaps = (snapRows as SnapshotRow[] | null) ?? [];

  const overviews = stores.map((s) => overviewFor(s, snaps, weeks));
  const self = overviews.find((s) => s.kind === "self") ?? null;
  const competitors = overviews.filter((s) => s.kind === "competitor");

  const allWeeks = Array.from(new Set(snaps.map((s) => s.week)))
    .sort()
    .slice(-weeks);

  return { self, competitors, weeks: allWeeks };
}

/* ─── Benchmarking (M2) ─────────────────────────────────────────────────── */

export type RankedStore = StoreOverview & {
  rank: number;
  gapToLeader: number;
  /** A competitor that has overtaken the user's own store. */
  passedYou: boolean;
};

export type Benchmark = {
  ranked: RankedStore[];
  leader: StoreOverview | null;
  /** Biggest absolute week-over-week move across the tracked set. */
  biggestMover: StoreOverview | null;
};

/** Rank the tracked set by current score; flag competitors that passed you. */
export function rankBenchmark(overview: MonitorOverview): Benchmark {
  const all = [
    ...(overview.self ? [overview.self] : []),
    ...overview.competitors,
  ].filter((s) => s.current != null);

  const sorted = [...all].sort(
    (a, b) => (b.current as number) - (a.current as number),
  );
  const leader = sorted[0] ?? null;
  const selfScore = overview.self?.current ?? null;

  const ranked: RankedStore[] = sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
    gapToLeader: leader ? (leader.current as number) - (s.current as number) : 0,
    passedYou:
      s.kind === "competitor" &&
      selfScore != null &&
      (s.current as number) > selfScore,
  }));

  let biggestMover: StoreOverview | null = null;
  for (const s of all) {
    if (s.delta == null) continue;
    if (biggestMover == null || Math.abs(s.delta) > Math.abs(biggestMover.delta ?? 0)) {
      biggestMover = s;
    }
  }

  return { ranked, leader, biggestMover };
}

/* ─── Hybrid source seam (M4) ───────────────────────────────────────────────
 * Same swap-later seam as TrendSource: the UI consumes monitoring through this
 * interface, so a future provider (e.g. a real-time re-score service) can be
 * dropped in without touching the page or DB. Default reads `score_snapshots`.
 */
export interface MonitorSource {
  readonly id: string;
  getMonitorOverview(userId: string, weeks?: number): Promise<MonitorOverview>;
}

export const snapshotMonitorSource: MonitorSource = {
  id: "snapshots",
  getMonitorOverview,
};
