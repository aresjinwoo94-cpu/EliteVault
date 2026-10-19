"use client";

import { useState } from "react";
import { m as motion } from "framer-motion";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SaveButton } from "./save-button";
import { TeardownDialog } from "./teardown-dialog";
import { cn } from "@/lib/utils";
import type { WinningSiteCard } from "@/app/actions/search";
import { useT } from "@/components/i18n/locale-provider";
import { fill } from "@/lib/i18n/lookup";
import { phCapture } from "@/lib/analytics/posthog";

/**
 * Resolve what a card should actually load, if anything.
 *
 * Two cases, both of which used to render a dead grey box:
 *
 *  1. LEGACY mshots URLs. Rows we couldn't snapshot (the store bot-blocks our
 *     capture) still point at s.wordpress.com/mshots, which renders on demand
 *     and answers a cold cache with a BLANK placeholder — served as HTTP 200,
 *     so `onError` never fires and the fallback never shows. Return null and
 *     go straight to the branded tile: an honest tile beats a blank image.
 *
 *  2. Our own snapshots are full-page captures (~2880x20000, 1-4MB) while the
 *     card is a ~400px 4:3 window — 53 of them was ~124MB of page weight.
 *     Supabase's render endpoint resizes on the fly: at width=800 the same
 *     shot drops 1173KB -> 141KB (-88%) for free, no re-capture. Aspect ratio
 *     is preserved (still tall), so `object-top` below still frames the hero.
 */
function thumbSrc(url: string | null | undefined): string | null {
  if (!url || url.includes("s.wordpress.com/mshots")) return null;
  const marker = "/storage/v1/object/public/";
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, "/storage/v1/render/image/public/")}?width=800&quality=70`;
}

/**
 * Library card (brief oct-2026 §L3, owner decision L-D1).
 *
 * The face of the card shows ONLY what is true and verifiable:
 *   • the store's name and niche,
 *   • a "Shopify" badge when the home really shows Shopify signals (store_checks),
 *   • the number of active Meta ads ONLY when it is a real, fresh Meta Ad Library measurement
 *     (`measured_ads` is computed on the server by measuredActiveAds()).
 * No CTR / ROI / conversion / traffic and no 0–100 score: those were AI estimates.
 *
 * The WHOLE card is a link to the store (stretched-link pattern): the title anchor stretches over the card
 * with an `after:` pseudo-element, and the ★ save / teardown controls sit above it (`relative z-10`), so using
 * them never opens the store.
 */
export function SiteCard({
  site,
  index = 0,
  canSave = false,
  initialSaved = false,
}: {
  site: WinningSiteCard;
  index?: number;
  /** Whether to show the ★ save button (Pro+). */
  canSave?: boolean;
  initialSaved?: boolean;
}) {
  const { t } = useT();
  const locked = !!site.metrics_locked;
  const [imgFailed, setImgFailed] = useState(false);
  const src = thumbSrc(site.thumbnail_url);
  const ads = typeof site.measured_ads === "number" && site.measured_ads > 0 ? site.measured_ads : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.4),
        duration: 0.45,
        ease: [0.22, 1, 0.36, 1],
      }}
      data-library-card
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card/40 transition-all focus-within:border-white/[0.2]",
        locked
          ? "border-white/[0.04] hover:border-champagne-400/20"
          : "border-white/[0.06] hover:border-white/[0.14]",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-obsidian-900">
        {imgFailed || !src ? (
          // Branded placeholder (landing-images-fix §4) — a dignified fallback
          // for any store still without a real image: subtle brand-gradient
          // bloom + the initial in a gradient ring + the niche. Not a bare letter.
          <div className="absolute inset-0 grid place-items-center overflow-hidden bg-gradient-to-br from-obsidian-800 to-obsidian-900">
            <div className="absolute inset-0 bg-dot-grid opacity-20" />
            <div
              aria-hidden
              className="absolute -inset-10 opacity-40"
              style={{
                background:
                  "radial-gradient(circle at 50% 45%, rgba(52,211,153,0.18) 0%, rgba(34,211,238,0.10) 40%, transparent 70%)",
              }}
            />
            <div className="relative flex flex-col items-center gap-2.5">
              <span
                className="grid size-14 place-items-center rounded-2xl p-[1.5px]"
                style={{ background: "var(--grad-brand)" }}
              >
                <span className="grid size-full place-items-center rounded-2xl bg-obsidian-900 font-serif text-2xl text-white">
                  {site.domain.replace(/^www\./, "").charAt(0).toUpperCase()}
                </span>
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                {site.niche}
              </span>
            </div>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={site.title}
            onError={() => setImgFailed(true)}
            className={cn(
              // object-TOP, not the browser default (center): thumbnails are
              // full-page captures, often 2880x20000 (ratio ~7), so centering
              // crops this 4:3 window to a random slice of the page's middle —
              // usually a footer or a product grid. The top is the hero, which
              // is what identifies the store at a glance.
              "absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105",
              locked && "grayscale-[40%]",
            )}
            loading="lazy"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian-950/80 via-obsidian-950/20 to-transparent" />
        {site.shopify_verified && (
          <div className="pointer-events-none absolute bottom-3 left-3">
            <Badge variant="default" className="bg-obsidian-950/70 shadow-card">
              Shopify
            </Badge>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="font-medium text-white">
            {/* Stretched link: the ::after covers the whole card (its positioned ancestor). */}
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={fill(t("siteCard.opensStore"), { title: site.title, domain: site.domain })}
              onClick={() =>
                phCapture("library_store_click", {
                  domain: site.domain,
                  niche: site.niche,
                  position: index + 1,
                  locked,
                })
              }
              className="block truncate after:absolute after:inset-0 after:content-[''] focus:outline-none"
            >
              {site.title}
            </a>
          </h3>
          <p className="mt-0.5 truncate text-xs capitalize text-white/45">{site.niche}</p>
          {ads !== null && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/55">
              <Megaphone className="size-3 text-signal-300" aria-hidden />
              {fill(t("siteCard.metaAds"), { n: ads })}
            </p>
          )}
        </div>
        {/* Above the stretched link: ★ save and teardown work without opening the store. */}
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {/* "Cómo convierte" — only for Pro+ (canSave) AND when this store
              actually has a curated teardown. Degrades to hidden otherwise
              (guardrail 7), never an empty placeholder. */}
          {canSave && site.teardown && (
            <TeardownDialog site={site} initialSaved={initialSaved} />
          )}
          {canSave && <SaveButton siteId={site.id} initialSaved={initialSaved} />}
        </div>
      </div>
    </motion.div>
  );
}
