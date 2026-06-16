import { Trophy, Flame } from "lucide-react";
import { ScoreBadge } from "@/components/ui/score-badge";
import { cn } from "@/lib/utils";
import type { Benchmark as BenchmarkData } from "@/lib/monitoring";

/**
 * Competitor scoreboard (M2): your store vs competitors by latest score, with
 * rank, gap-to-leader, and a flag when a competitor has passed you — plus the
 * biggest week-over-week mover across the tracked set. Pure presentational;
 * derived from score_snapshots, no model calls.
 */
export function Benchmark({ data }: { data: BenchmarkData }) {
  if (data.ranked.length < 2) return null;
  const total = data.ranked.length;

  return (
    <section className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.01] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-signal-300">
          <Trophy className="size-3.5 text-signal-400" />
          Scoreboard
        </h2>
        {data.biggestMover?.delta != null && data.biggestMover.delta !== 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55">
            <Flame className="size-3.5 text-signal-400" />
            Biggest mover:{" "}
            <span className="font-medium text-white/80">
              {data.biggestMover.label ?? data.biggestMover.domain}
            </span>
            <span
              className={cn(
                "num",
                data.biggestMover.delta > 0 ? "text-success" : "text-destructive",
              )}
            >
              {data.biggestMover.delta > 0 ? "▲" : "▼"}
              {Math.abs(data.biggestMover.delta)}
            </span>
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {data.ranked.map((s) => (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2",
              s.kind === "self"
                ? "border-champagne-400/25 bg-champagne-400/[0.04]"
                : s.passedYou
                  ? "border-destructive/25 bg-destructive/[0.03]"
                  : "border-white/[0.05] bg-white/[0.01]",
            )}
          >
            <span className="num w-7 shrink-0 text-center text-sm text-white/45">
              #{s.rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-white/90">
                  {s.label ?? s.domain}
                </span>
                {s.kind === "self" && (
                  <span className="rounded-full bg-champagne-400/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-champagne-200">
                    You
                  </span>
                )}
                {s.passedYou && (
                  <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive">
                    Passed you
                  </span>
                )}
              </div>
              <p className="num mt-0.5 text-[10px] text-white/35">
                {s.rank === 1 ? "leader" : `−${s.gapToLeader} to leader`}
                {" · "}#{s.rank} of {total}
              </p>
            </div>
            <ScoreBadge score={s.current as number} total={null} size="md" />
          </div>
        ))}
      </div>
    </section>
  );
}
