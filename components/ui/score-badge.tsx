import { cn } from "@/lib/utils";

/**
 * ScoreBadge — the ONE coherent treatment for inline / list / dashboard
 * scores (analyzer lists, library, dashboard, community). A mono tabular
 * numeral in a bracketed pill with a **value-keyed ring**:
 *
 *   0–39  → destructive   40–69 → warning   70–100 → signal (teal)
 *
 * NOTE: the single big hero/detail audit score keeps its own ownable
 * `font-serif` + `text-gold-gradient` motif — this primitive is for every
 * OTHER score so they read as one designed system, not accidental.
 */
export function ScoreBadge({
  score,
  total = 100,
  size = "md",
  className,
}: {
  score: number;
  /** Denominator shown muted after the score. Pass `null` to hide it. */
  total?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const value = Math.round(score);
  const tone =
    value >= 70 ? "signal" : value >= 40 ? "warning" : "destructive";

  const TONE: Record<typeof tone, string> = {
    signal: "text-signal-300 ring-signal-400/40 bg-signal-600/10",
    warning: "text-warning ring-warning/40 bg-warning/10",
    destructive: "text-destructive ring-destructive/40 bg-destructive/10",
  };

  const SIZE: Record<NonNullable<typeof size>, string> = {
    sm: "text-[11px] px-1.5 py-0.5",
    md: "text-sm px-2 py-0.5",
    lg: "text-base px-2.5 py-1",
  };

  return (
    <span
      className={cn(
        "inline-flex items-baseline rounded-md ring-1 font-mono tabular-nums tracking-tight",
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      <span className="font-medium">{value}</span>
      {total != null && (
        <span className="ml-px text-[0.78em] opacity-50">/{total}</span>
      )}
    </span>
  );
}
