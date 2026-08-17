"use client";

import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { AuditSnapshot } from "./audit-snapshot";

/**
 * Analyzer collage (landing §2) — replaces the invented AuditSnapshot mock in
 * the #analyzer section ("A senior media buyer in a tab") with a COMPACT bento
 * of REAL product screenshots. Must stay clear and small — it sits in the
 * demo's visual column, not fill the page.
 *
 * ── HOW TO GO LIVE ──────────────────────────────────────────────────────────
 * 1. Drop these PNGs (dark product background, high-res / 2×) into
 *    `public/marketing/analyzer/`:
 *        annotated.png   — the store screenshot with the numbered pins (hero)
 *        dimensions.png  — the "Where you're leaking sales" radar + the 6 scores
 *        persona.png     — the buyer-persona reaction / quote
 *        fixes.png       — the ranked top-fixes list
 *    (meta.png — the 7-day Meta modeler — is intentionally NOT used; it's a
 *     form and reads weak at small size. Add it back as a tile only if wanted.)
 * 2. Flip `COLLAGE_READY` to `true` below.
 * Until then this renders the existing <AuditSnapshot /> so the build never
 * breaks and never shows a missing image. audit-snapshot.tsx stays as fallback.
 *
 * The score ring is GONE from the product — the money-potential + niche pill
 * (rendered here in crisp HTML, not a screenshot) is the headline instead.
 * Values are illustrative (a product demo, like the old mock), not a claim.
 */

const COLLAGE_READY = false;

const BASE = "/marketing/analyzer";

export function AnalyzerCollage() {
  // Fallback: until the real screenshots are in place, keep the snapshot mock.
  if (!COLLAGE_READY) return <AuditSnapshot />;

  return (
    <div className="relative">
      {/* Ambient glow — teal (signal), same accent as the section. */}
      <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-tr from-signal-600/20 via-transparent to-signal-400/15 blur-2xl" />

      <div className="relative flex flex-col gap-2.5">
        {/* Top row — annotated hero (with overlays) + the dimensions radar.
            Fixed row height so the two different aspect ratios line up. */}
        <div className="grid h-56 grid-cols-[3fr_2fr] gap-2.5 sm:h-64">
          <Tile className="relative">
            <Image
              src={`${BASE}/annotated.png`}
              alt="Annotated store screenshot with numbered conversion findings"
              fill
              sizes="(max-width: 1024px) 60vw, 30vw"
              className="object-cover object-top"
              priority
            />
            {/* AUDIT COMPLETE — kept from the mock's language. */}
            <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-success/30 bg-obsidian-900/80 px-2 py-1 text-[10px] uppercase tracking-widest text-success backdrop-blur">
              <CheckCircle2 className="size-3" />
              Audit complete
            </div>
            {/* Money-potential + niche pill — replaces the old score ring.
                Crisp HTML instead of a screenshot crop. */}
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-full border border-signal-400/30 bg-obsidian-900/85 px-2.5 py-1.5 backdrop-blur">
              <span className="text-[10px] uppercase tracking-wide text-white/50">
                Potential
              </span>
              <span className="font-mono text-sm tabular-nums text-white">
                ~$1k–8k<span className="text-white/45">/mo</span>
              </span>
              <span className="rounded-full border border-signal-400/40 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-signal-300">
                Fitness
              </span>
            </div>
          </Tile>

          <Tile>
            <Image
              src={`${BASE}/dimensions.png`}
              alt="Where you're leaking sales — six conversion dimensions scored"
              fill
              sizes="(max-width: 1024px) 40vw, 20vw"
              className="object-contain"
            />
          </Tile>
        </div>

        {/* Buyer-persona quote — wide, short. */}
        <Tile className="h-24 sm:h-28">
          <Image
            src={`${BASE}/persona.png`}
            alt="Buyer-persona reaction to the store"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
          />
        </Tile>

        {/* Ranked top fixes — wide strip. */}
        <Tile className="h-20 sm:h-24">
          <Image
            src={`${BASE}/fixes.png`}
            alt="Ranked list of top fixes"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
          />
        </Tile>
      </div>
    </div>
  );
}

/** One collage tile: hairline border, rounded, dark ground (so object-contain
 *  letterboxing on text screenshots is invisible). */
function Tile({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure
      className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-obsidian-900/60 ${className}`}
    >
      {children}
    </figure>
  );
}
