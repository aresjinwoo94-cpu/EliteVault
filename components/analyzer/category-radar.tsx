"use client";

import { Card } from "@/components/ui/card";

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

export function CategoryRadar({ scores }: { scores: CategoryScores }) {
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
      <h3 className="text-sm font-medium text-white">Category breakdown</h3>
      <div className="mt-4">
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
              fontSize="7"
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
    </Card>
  );
}
