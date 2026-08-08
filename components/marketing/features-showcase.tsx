"use client";

import NextImage from "next/image";
import { motion } from "framer-motion";
import { Compass, Image as ImageIcon, Library, Store, TrendingUp } from "lucide-react";
import { DataPill } from "@/components/ui/data-pill";
import { useT } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * "The engine" — a BENTO grid of differently-sized tiles (landing brief §4·6),
 * replacing the old four-identical-icon-cards pattern (a "generic AI" tell).
 * Each tile carries a small, purpose-built visual — never a stock icon alone,
 * never an emoji. Numbers are JetBrains Mono + tabular-nums.
 *
 * Layout (md+ · 6-col): row 1 = 4 + 2, row 2 = 2 + 4 → deliberate asymmetry.
 * Copy keys are unchanged (feature1–4), so the i18n contract is preserved.
 */
export function FeaturesShowcase() {
  const { t } = useT();

  const tiles = [
    {
      icon: Library,
      titleKey: "features.feature1Title",
      bodyKey: "features.feature1Body",
      span: "md:col-span-4",
      visual: <WinnersVisual live={t("features.feature1Live")} />,
    },
    {
      icon: ImageIcon,
      titleKey: "features.feature2Title",
      bodyKey: "features.feature2Body",
      span: "md:col-span-2",
      visual: (
        <SimilarityVisual
          match={t("features.feature2Match")}
          your={t("features.feature2Your")}
          close={t("features.feature2Close")}
        />
      ),
    },
    {
      icon: Compass,
      titleKey: "features.feature3Title",
      bodyKey: "features.feature3Body",
      span: "md:col-span-2",
      visual: <NicheVisual up={t("features.feature3Up")} down={t("features.feature3Down")} />,
    },
    {
      icon: TrendingUp,
      titleKey: "features.feature4Title",
      bodyKey: "features.feature4Body",
      span: "md:col-span-4",
      visual: <ForecastVisual t={t} />,
    },
  ];

  return (
    <section id="library" className="section-y">
      <div className="container max-w-6xl">
        <div className="max-w-2xl">
          <DataPill items={[t("features.pill1"), t("features.pill2")]} />
          <h2 className="mt-5 font-serif text-4xl md:text-5xl tracking-tight leading-tight">
            {t("features.heading")}
          </h2>
          <p className="mt-4 text-white/55 leading-relaxed text-lg">
            {t("features.subheading")}
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-6">
          {tiles.map((tile, i) => (
            <motion.div
              key={tile.titleKey}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.06, ease }}
              className={cn(
                "group glow-card glow-sheen relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-card p-6 shadow-card",
                tile.span,
              )}
            >
              {/* Top-corner brand-gradient hairline — the shared "Scan" accent. */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-0 top-0 h-16 w-16 opacity-40 transition-opacity group-hover:opacity-70"
                style={{
                  background:
                    "radial-gradient(circle at top right, rgba(34,211,238,0.18), transparent 70%)",
                }}
              />
              <div className="flex size-10 items-center justify-center rounded-lg bg-signal-600/10 ring-1 ring-signal-500/20">
                <tile.icon className="size-4 text-signal-300" />
              </div>
              <h3 className="mt-5 font-serif text-lg tracking-tight text-white">
                {t(tile.titleKey)}
              </h3>
              <p className="mt-1.5 text-sm text-white/55 leading-relaxed">
                {t(tile.bodyKey)}
              </p>
              <div className="mt-5 flex-1">{tile.visual}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/*
 * Real store-thumbnail slots for the bento (ronda-3 §1) — the old abstract
 * bars/skeletons read as meaningless. Drop the AI-generated store screenshots
 * (~800×500, 16:10, WebP/PNG) at the paths below and they render automatically;
 * until then each slot is a CLEAN neutral placeholder (flat block + icon), NOT
 * a loading skeleton.
 *
 *   Winners grid  → public/bento/winners/1.webp … 6.webp
 *   Similarity    → public/bento/similarity/your-store.webp + closest-match.webp
 *
 * `null` = not uploaded yet → placeholder. Replace a `null` with its "/bento/…"
 * path once the file exists.
 */
const WINNER_THUMBS: (string | null)[] = [
  "/bento/winners/1.webp",
  "/bento/winners/2.webp",
  "/bento/winners/3.webp",
  "/bento/winners/4.webp",
  "/bento/winners/5.webp",
  "/bento/winners/6.webp",
];
const SIMILARITY_PAIR: { your: string | null; match: string | null } = {
  your: "/bento/similarity/your-store.webp",
  match: "/bento/similarity/closest-match.webp",
};

/** One store-thumbnail slot: real image when provided, else a clean neutral
 *  placeholder (flat surface + icon) — never a skeleton. */
function ThumbSlot({
  src,
  alt,
  highlight = false,
  sizes = "160px",
  ratioClass = "aspect-[16/10]",
}: {
  src: string | null;
  alt: string;
  highlight?: boolean;
  sizes?: string;
  ratioClass?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border",
        ratioClass,
        highlight
          ? "border-signal-500/30 bg-signal-600/[0.06]"
          : "border-white/[0.07] bg-white/[0.025]",
      )}
    >
      {src ? (
        <NextImage src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center">
          <Store
            className={cn(
              "size-4",
              highlight ? "text-signal-300/50" : "text-white/20",
            )}
          />
        </span>
      )}
    </div>
  );
}

/** Live-winners visual — a grid of real store thumbnails with the `● LIVE 4.4%`
 *  mono chip riding over one of them. */
function WinnersVisual({ live }: { live: string }) {
  return (
    <div className="relative h-full">
      <div className="grid grid-cols-3 gap-2">
        {WINNER_THUMBS.map((src, i) => (
          <ThumbSlot key={i} src={src} alt={`Winning store thumbnail ${i + 1}`} />
        ))}
      </div>
      {/* Live cohort chip over one thumbnail (mono). */}
      <div className="absolute right-1.5 top-1.5 rounded-md border border-signal-500/25 bg-obsidian-950/80 px-2 py-1 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-signal-400 motion-safe:animate-glow" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-signal-300/90">
            {live}
          </span>
          <span className="font-mono text-[11px] tabular-nums leading-none text-signal-300">
            4.4<span className="text-[10px] text-white/40">%</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Image-similarity visual — two real, structurally-similar store screenshots
 *  stacked ("your store" → "closest match") with the `97% MATCH` mono badge +
 *  arrow between them (matches the wide homepage crops). */
function SimilarityVisual({ match, your, close }: { match: string; your: string; close: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className="relative">
        <ThumbSlot src={SIMILARITY_PAIR.your} alt="Your store" sizes="260px" ratioClass="aspect-[16/5]" />
        <span className="absolute left-1.5 top-1.5 rounded bg-obsidian-950/75 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/60 backdrop-blur-sm">
          {your}
        </span>
      </div>

      {/* Match badge + downward arrow linking the two. */}
      <div className="flex items-center justify-center gap-1.5 text-signal-300">
        <span className="font-mono text-[10px] tabular-nums">97%</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-signal-300/80">
          {match}
        </span>
        <svg width="10" height="14" viewBox="0 0 10 14" fill="none" aria-hidden>
          <path d="M5 0v12m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      <div className="relative">
        <ThumbSlot
          src={SIMILARITY_PAIR.match}
          alt="Closest converting match"
          highlight
          sizes="260px"
          ratioClass="aspect-[16/5]"
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-obsidian-950/75 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal-300/70 backdrop-blur-sm">
          {close}
        </span>
      </div>
    </div>
  );
}

/** Niche-judgment visual — one rule that flips between two verticals. */
function NicheVisual({ up, down }: { up: string; down: string }) {
  return (
    <div className="flex h-full flex-col justify-end gap-2">
      <div className="flex items-center justify-between rounded-lg border border-success/25 bg-success/[0.06] px-3 py-2">
        <span className="text-xs text-white/75">{up}</span>
        <TrendingUp className="size-3.5 text-success" />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-destructive/25 bg-destructive/[0.05] px-3 py-2">
        <span className="text-xs text-white/75">{down}</span>
        <TrendingUp className="size-3.5 rotate-180 text-destructive" />
      </div>
    </div>
  );
}

/** Forecast visual — three honest scenarios as mono ROAS chips + mini bars. */
function ForecastVisual({ t }: { t: (k: string) => string }) {
  const rows = [
    { key: t("features.forecastConservative"), roas: "0.7", w: "38%", tone: "text-warning" },
    { key: t("features.forecastBalanced"), roas: "1.4", w: "62%", tone: "text-signal-300" },
    { key: t("features.forecastAggressive"), roas: "2.1", w: "88%", tone: "text-success" },
  ];
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-white/45">
            {r.key}
          </span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: r.w, background: "var(--grad-brand)" }}
            />
          </div>
          <span className={cn("w-12 shrink-0 text-right font-mono text-sm tabular-nums", r.tone)}>
            {r.roas}×
          </span>
        </div>
      ))}
    </div>
  );
}
