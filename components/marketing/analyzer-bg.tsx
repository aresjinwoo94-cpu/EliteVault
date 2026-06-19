/**
 * AnalyzerBg — ambient "AI scanner" backdrop for the #analyzer section.
 *
 * Layered, premium, and on-theme (obsidian + teal — zero gold), in the spirit
 * of Linear / Vercel / Stripe landing demos: a faint dot-grid, two slow-
 * drifting teal auroras, a periodic vertical "scan line" that reinforces the
 * "analyzing…" idea, and a subtle constellation of connected nodes.
 *
 * Performance: every animation is GPU-only (transform / opacity) — nothing
 * triggers reflow. It sits behind the walkthrough (`-z-10`), is
 * `pointer-events-none`, and `overflow-hidden` keeps the blurs contained.
 *
 * Accessibility: each animated layer carries `motion-reduce:animate-none`, so
 * under `prefers-reduced-motion` the backdrop is fully static.
 */
export function AnalyzerBg({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className ?? ""}`}
    >
      {/* Faint dot grid, masked to a soft center so edges fade out. */}
      <div className="absolute inset-0 bg-dot-grid opacity-[0.5] mask-radial" />

      {/* Drifting teal auroras. */}
      <div
        className="absolute -left-[15%] -top-[20%] size-[55%] rounded-full blur-3xl opacity-60 animate-aurora-drift motion-reduce:animate-none"
        style={{
          background:
            "radial-gradient(circle at center, rgba(45,212,191,0.22), transparent 65%)",
        }}
      />
      <div
        className="absolute -right-[12%] bottom-[-18%] size-[50%] rounded-full blur-3xl opacity-50 animate-aurora-drift-2 motion-reduce:animate-none"
        style={{
          background:
            "radial-gradient(circle at center, rgba(20,184,166,0.20), transparent 65%)",
        }}
      />

      {/* Subtle connected-node constellation (analysis / neural motif). */}
      <svg
        className="absolute inset-0 h-full w-full animate-node-pulse motion-reduce:animate-none"
        viewBox="0 0 100 60"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="rgba(94,234,212,0.5)" strokeWidth="0.15">
          <line x1="12" y1="14" x2="34" y2="8" />
          <line x1="34" y1="8" x2="52" y2="20" />
          <line x1="52" y1="20" x2="74" y2="12" />
          <line x1="74" y1="12" x2="88" y2="28" />
          <line x1="12" y1="14" x2="24" y2="38" />
          <line x1="24" y1="38" x2="52" y2="20" />
          <line x1="24" y1="38" x2="46" y2="50" />
          <line x1="46" y1="50" x2="74" y2="44" />
          <line x1="74" y1="44" x2="88" y2="28" />
          <line x1="52" y1="20" x2="74" y2="44" />
        </g>
        <g fill="rgba(45,212,191,0.85)">
          {[
            [12, 14],
            [34, 8],
            [52, 20],
            [74, 12],
            [88, 28],
            [24, 38],
            [46, 50],
            [74, 44],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.55" />
          ))}
        </g>
      </svg>

      {/* Periodic vertical scan line (full-height wrapper translates down). */}
      <div className="absolute inset-0 animate-scan-sweep motion-reduce:animate-none motion-reduce:opacity-0">
        <div
          className="absolute inset-x-0 top-0 h-28"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgba(45,212,191,0.12) 45%, rgba(94,234,212,0.5) 50%, rgba(45,212,191,0.12) 55%, transparent)",
          }}
        />
      </div>
    </div>
  );
}
