import { cn } from "@/lib/utils";

/**
 * DataPill — the signature "quant terminal" eyebrow/kicker.
 *
 * Slim, rounded-full, obsidian fill with a 1px teal border at low alpha and a
 * faint teal outer glow. A small pulsing teal dot leads uppercase monospace
 * text, with segments separated by `·`. This is the visual anchor of the
 * "Obsidian Quant" identity: precise, monospaced, lit from within.
 *
 * Example: <DataPill items={["100.000 SIMULACIONES", "MONTE CARLO", "ELO"]} />
 *   renders  ● 100.000 SIMULACIONES · MONTE CARLO · ELO
 *
 * The pulsing dot honors `prefers-reduced-motion` via `motion-safe:`.
 */
export function DataPill({
  items,
  tone = "signal",
  className,
}: {
  items: string[];
  tone?: "signal" | "gold";
  className?: string;
}) {
  const isGold = tone === "gold";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-obsidian-950/80 px-3.5 py-1.5",
        "font-mono text-[11px] tracking-[0.18em] uppercase",
        isGold
          ? "border border-champagne-400/25 text-champagne-300 shadow-gold"
          : "border border-signal-400/25 text-signal-300 shadow-signal",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex size-1.5 shrink-0 rounded-full",
          isGold ? "bg-champagne-400" : "bg-signal-400",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping",
            isGold ? "bg-champagne-400" : "bg-signal-400",
          )}
        />
      </span>
      <span className="flex items-center gap-2">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-white/25">·</span>}
            <span className="tabular-nums">{item}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
