"use client";

import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { AuditSnapshot } from "./audit-snapshot";
import { ScoreRing } from "./scan-field";

/**
 * Analyzer collage (landing §2) — replaces the invented AuditSnapshot mock in
 * the #analyzer section with a bento of REAL product screenshots, so the demo
 * shows the actual deliverable instead of a hand-drawn approximation.
 *
 * ── HOW TO GO LIVE ──────────────────────────────────────────────────────────
 * 1. Drop the six PNGs (dark product background, high-res) into
 *    `public/marketing/analyzer/`:
 *        score.png       — the score ring + verdict
 *        annotated.png   — the annotated screenshot with numbered pins
 *        categories.png  — the 6-category breakdown
 *        fixes.png       — the ranked top-fixes list
 *        persona.png     — the buyer-persona reaction / quote
 *        meta.png        — the 7-day Meta projection / ROAS scenarios
 * 2. Flip `COLLAGE_READY` to `true` below.
 * That's it — no other change. Until then this renders the existing
 * <AuditSnapshot /> so the section is never broken and never shows a missing
 * image. (audit-snapshot.tsx stays in the repo as the fallback + easy revert.)
 *
 * NOTE: the exact bento spans / object-fit are tuned to the real images once
 * they land; the layout below is the first pass.
 */

const COLLAGE_READY = false;

const BASE = "/marketing/analyzer";

type Tile = {
  src: string;
  alt: string;
  /** Tailwind col/row span classes for the bento. */
  span: string;
  /** Aspect ratio box so next/image `fill` has a sized parent. */
  aspect: string;
};

const TILES: Tile[] = [
  {
    src: `${BASE}/annotated.png`,
    alt: "Annotated store screenshot with numbered conversion findings",
    span: "col-span-2 row-span-2",
    aspect: "aspect-[4/3]",
  },
  {
    src: `${BASE}/score.png`,
    alt: "Audit score ring and verdict",
    span: "col-span-1",
    aspect: "aspect-square",
  },
  {
    src: `${BASE}/categories.png`,
    alt: "Six-category breakdown of the audit",
    span: "col-span-1",
    aspect: "aspect-square",
  },
  {
    src: `${BASE}/fixes.png`,
    alt: "Ranked list of top fixes",
    span: "col-span-1",
    aspect: "aspect-[4/5]",
  },
  {
    src: `${BASE}/persona.png`,
    alt: "Buyer-persona reaction to the store",
    span: "col-span-1",
    aspect: "aspect-[4/5]",
  },
  {
    src: `${BASE}/meta.png`,
    alt: "Seven-day Meta campaign projection",
    span: "col-span-2",
    aspect: "aspect-[16/9]",
  },
];

export function AnalyzerCollage() {
  // Fallback: while the real screenshots aren't in place, keep showing the
  // existing snapshot mock. Never a broken build, never a missing <img>.
  if (!COLLAGE_READY) return <AuditSnapshot />;

  return (
    <div className="relative">
      {/* Ambient glow — teal (signal), same accent as the section. */}
      <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl" />

      <div className="relative grid grid-cols-3 gap-2.5 sm:gap-3">
        {TILES.map((tile, i) => {
          const isHero = i === 0;
          return (
            <figure
              key={tile.src}
              className={[
                "relative overflow-hidden rounded-xl border border-white/[0.06] bg-obsidian-900/60",
                tile.span,
                tile.aspect,
                // Only the floating hero tile gets a soft shadow — everything
                // else stays flat so the collage reads as one surface.
                isHero ? "shadow-2xl" : "",
              ].join(" ")}
            >
              <Image
                src={tile.src}
                alt={tile.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />

              {isHero && (
                <>
                  {/* AUDIT COMPLETE badge — kept from the mock's language. */}
                  <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-full border border-success/30 bg-obsidian-900/80 px-2 py-1 text-[10px] uppercase tracking-widest text-success backdrop-blur">
                    <CheckCircle2 className="size-3" />
                    Audit complete
                  </div>
                  {/* Score ring overlay — the signature "Scan" object floating
                      on the hero tile's corner. */}
                  <div className="absolute bottom-2.5 left-2.5 z-10 rounded-xl border border-white/[0.06] bg-obsidian-900/70 p-2 backdrop-blur">
                    <ScoreRing value={62} size={72} />
                  </div>
                </>
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
