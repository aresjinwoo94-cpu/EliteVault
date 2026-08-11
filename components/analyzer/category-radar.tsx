"use client";

import { Card } from "@/components/ui/card";
import { useT } from "@/components/i18n/locale-provider";
import { deriveOverallScore } from "@/lib/analyzer/derive-score";

const LABELS: { key: keyof CategoryScores; short: string }[] = [
  { key: "color_integration", short: "Color" },
  { key: "layout_proportion", short: "Layout" },
  { key: "image_quality", short: "Imagery" },
  { key: "technical_optimization", short: "Tech" },
  { key: "niche_coherence", short: "Niche fit" },
  { key: "cro_principles", short: "CRO" },
];

type CategoryScores = {
  color_integration: number;
  layout_proportion: number;
  image_quality: number;
  technical_optimization: number;
  niche_coherence: number;
  cro_principles: number;
};

export function CategoryRadar({
  scores,
  overall,
  leaksFraming = false,
}: {
  scores: CategoryScores;
  /**
   * Brief §1 — the report's hero score. The reconciliation line is shown ONLY
   * when the weighted categories actually reproduce it (i.e. a v2, code-derived
   * audit). On an old audit whose stored score predates the derivation, the
   * numbers wouldn't match, so we hide the line rather than contradict the hero.
   */
  overall?: number | null;
  /**
   * Master brief §B3 — reframe the radar as "where you're leaking sales" (the
   * why behind your stage) instead of six neutral grades. Copy only; the viz and
   * the numbers are unchanged.
   */
  leaksFraming?: boolean;
}) {
  const { t } = useT();
  // Gemini Flash-Lite sometimes returns scores as 0..1 fractions instead
  // of 0..100. If the max value across all categories is ≤ 1, treat them
  // as 0..1 and rescale. Otherwise use as-is.
  const rawValues = LABELS.map((l) => scores[l.key] ?? 0);
  const maxScore = Math.max(...rawValues);
  const scaleUp = maxScore > 0 && maxScore <= 1 ? 100 : 1;
  const normalized: CategoryScores = LABELS.reduce(
    (acc, l) => {
      acc[l.key] = (scores[l.key] ?? 0) * scaleUp;
      return acc;
    },
    {} as CategoryScores,
  );

  const cx = 100;
  const cy = 100;
  const r = 78;
  const N = LABELS.length;

  const points = LABELS.map((l, i) => {
    const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
    const score = normalized[l.key];
    const dist = (r * score) / 100;
    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      labelX: cx + Math.cos(angle) * (r + 18),
      labelY: cy + Math.sin(angle) * (r + 18),
      short: l.short,
      score,
    };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Card className="p-6">
      <h3 className="text-sm font-medium text-white">
        {leaksFraming ? t("report.leaksHeading") : "Category breakdown"}
      </h3>
      {leaksFraming && (
        <p className="mt-1 text-[11.5px] leading-snug text-white/45">
          {t("report.leaksSub")}
        </p>
      )}
      {/* Cap the radar so it stays compact even when this card is full-width
          (stacked on narrow screens / in the anonymous report), instead of
          blowing up to the container width. The numbers grid below keeps the
          card's full width. */}
      <div className="mt-4 mx-auto max-w-[300px]">
        <svg viewBox="0 0 200 200" className="w-full h-auto">
          {/* concentric rings */}
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <circle
              key={f}
              cx={cx}
              cy={cy}
              r={r * f}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="0.6"
            />
          ))}
          {/* axes */}
          {LABELS.map((_, i) => {
            const angle = (Math.PI * 2 * i) / N - Math.PI / 2;
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={cx + Math.cos(angle) * r}
                y2={cy + Math.sin(angle) * r}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="0.5"
              />
            );
          })}
          {/* polygon */}
          <polygon
            points={polygon}
            fill="rgba(45, 212, 191,0.18)"
            stroke="#2DD4BF"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          {points.map((p) => (
            <circle key={p.short} cx={p.x} cy={p.y} r="2" fill="#2DD4BF" />
          ))}
          {/* labels */}
          {points.map((p) => (
            <text
              key={p.short + "_label"}
              x={p.labelX}
              y={p.labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill="rgba(255,255,255,0.65)"
              className="font-medium"
            >
              {p.short}
            </text>
          ))}
        </svg>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {LABELS.map((l) => (
          <div key={l.key} className="flex justify-between text-xs">
            <span className="text-white/50">{l.short}</span>
            <span className="tnum text-white/85">
              {Math.round(normalized[l.key])}
            </span>
          </div>
        ))}
      </div>
      {/* Brief §1 — make the reconciliation visible: the six categories,
          weighted, ARE the overall hero score. Derived with the same code the
          persistence path uses, so what's shown here matches the hero exactly. */}
      {(() => {
        const derived = deriveOverallScore(normalized);
        if (derived == null) return null;
        // Only claim the reconciliation when it's true against the hero.
        const hero =
          typeof overall === "number" && Number.isFinite(overall)
            ? Math.round(overall > 1 ? overall : overall * 100)
            : derived;
        if (hero !== derived) return null;
        return (
          <p className="mt-3 border-t border-white/[0.05] pt-3 text-[11px] leading-relaxed text-white/40">
            {t("report.categoryReconcile").replace("{overall}", String(derived))}
          </p>
        );
      })()}
    </Card>
  );
}
