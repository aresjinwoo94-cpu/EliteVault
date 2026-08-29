"use client";

import { BLOCK_CATALOG, type CatalogBlockType } from "@/lib/blocks/catalog";
import { BLOCK_VARIANTS } from "@/lib/blocks/variants";

/**
 * Liquid Blocks WP-F — the catalogue, as something you browse.
 *
 * # Why this exists
 * The picker used to be a two-column list of buttons buried under the preview,
 * and the owner's report after testing was simply: "no los encontré". A
 * catalogue nobody finds is a catalogue that doesn't exist, and the preview
 * with no block chosen is a dead end — there is nothing to preview yet.
 *
 * So the gallery leads. Choosing is the first thing on the page, the block
 * types read as a library rather than as a form control, and each one shows
 * what it needs from you before you commit to filling it in.
 *
 * # The honesty label is part of the card, not a footnote
 * A block whose market equivalent is interactive carries its limitation HERE,
 * where the merchant decides — not in a tooltip they meet afterwards. Choosing
 * a block and discovering later that half of it doesn't work is the experience
 * this product is supposed to be an escape from.
 */

/**
 * A tiny inline diagram per block type.
 *
 * Deliberately abstract rather than a screenshot: a thumbnail of a real store's
 * block would be someone else's design, and would promise a specific look we
 * can't honour — every block is rendered in the MERCHANT's measured tokens, so
 * two stores get two different-looking versions of the same choice. A shape
 * conveys the layout without lying about the styling.
 */
function Thumb({ type }: { type: CatalogBlockType }) {
  const bar = "rgb(255 255 255 / 0.22)";
  const accent = "#2DD4BF";
  const common = { rx: 1.5, fill: bar } as const;

  return (
    <svg
      viewBox="0 0 88 44"
      className="w-full h-auto rounded-md bg-white/[0.03]"
      aria-hidden="true"
    >
      {type === "comparison" && (
        <>
          <rect x="6" y="6" width="34" height="32" rx="2" fill={accent} opacity="0.14" />
          <rect x="6" y="6" width="34" height="7" rx="2" fill={accent} opacity="0.5" />
          <rect x="44" y="6" width="34" height="32" rx="2" fill={bar} opacity="0.5" />
          {[18, 25, 32].map((y) => (
            <g key={y}>
              <rect x="10" y={y} width="14" height="3" {...common} />
              <rect x="48" y={y} width="14" height="3" {...common} opacity="0.5" />
            </g>
          ))}
        </>
      )}
      {type === "trust_icons" && (
        <>
          {[8, 28, 48, 68].map((x) => (
            <g key={x}>
              <circle cx={x + 6} cy="17" r="5" fill={accent} opacity="0.45" />
              <rect x={x} y="27" width="12" height="3" {...common} />
            </g>
          ))}
        </>
      )}
      {type === "feature_grid" && (
        <>
          {[6, 32, 58].map((x) => (
            <g key={x}>
              <rect x={x} y="8" width="24" height="28" rx="2" fill={bar} opacity="0.28" />
              <circle cx={x + 8} cy="16" r="4" fill={accent} opacity="0.5" />
              <rect x={x + 4} y="24" width="16" height="3" {...common} />
              <rect x={x + 4} y="29" width="12" height="2.5" {...common} opacity="0.4" />
            </g>
          ))}
        </>
      )}
      {type === "brand_cards" && (
        <>
          <rect x="6" y="7" width="20" height="5" rx="1.5" fill={accent} opacity="0.5" />
          <rect x="6" y="16" width="60" height="4" {...common} />
          {[24, 30, 36].map((y) => (
            <g key={y}>
              <circle cx="9" cy={y + 1.5} r="2" fill={accent} opacity="0.5" />
              <rect x="14" y={y} width="40" height="3" {...common} opacity="0.5" />
            </g>
          ))}
        </>
      )}
      {type === "product_stats" && (
        <>
          {[8, 20, 32].map((y, i) => (
            <g key={y}>
              <rect x="6" y={y} width="18" height="3" {...common} />
              <rect x="28" y={y} width={[46, 30, 38][i]} height="3" rx="1.5" fill={accent} opacity="0.5" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

const INTERACTIVITY_LABEL: Record<string, string> = {
  static: "Pure Liquid · no JavaScript",
  presentational: "Display only",
};

export function BlockGallery({
  selected,
  onSelect,
}: {
  selected: CatalogBlockType | null;
  onSelect: (type: CatalogBlockType) => void;
}) {
  return (
    /*
      A radio group, not seven toggle buttons.

      `aria-pressed` said "pressed / not pressed" about each card with nothing
      tying them together, so a screen reader announced seven independent
      switches and never that choosing one un-chooses the rest — which is the
      only thing a merchant needs to know here. Native radios are used rather
      than `role="radio"` on a button because the browser then supplies arrow-key
      navigation, roving focus and the "3 of 7, selected" position announcement;
      hand-rolling those is how half-done radiogroups end up worse than the
      buttons they replaced. The input is visually hidden, so the card is still
      the whole target.
    */
    <div
      role="radiogroup"
      aria-label="Block type"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {BLOCK_CATALOG.map((block) => {
        const active = selected === block.id;
        const variants = BLOCK_VARIANTS[block.id] ?? [];
        return (
          <label
            key={block.id}
            className={
              "block cursor-pointer text-left rounded-xl border p-4 transition-all " +
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-champagne-400/60 " +
              (active
                ? "border-champagne-400/60 bg-white/[0.05] ring-1 ring-champagne-400/30"
                : "border-white/[0.06] bg-card/30 hover:border-white/[0.16] hover:bg-card/50")
            }
          >
            <input
              type="radio"
              name="ev-block-type"
              value={block.id}
              checked={active}
              onChange={() => onSelect(block.id)}
              className="sr-only"
            />
            <Thumb type={block.id} />

            <p className="mt-3 text-sm font-medium text-white/90">{block.name}</p>
            <p className="mt-1 text-xs text-white/45 leading-relaxed">
              {block.summary}
            </p>

            {/*
              12px floor, not 10px. The interactivity chip is the honesty label
              this catalogue is built around — "static" vs "needs a developer" —
              so setting it in the smallest, faintest type on the card put the
              one disclosure that changes a buying decision at the bottom of the
              legibility order.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span
                className={
                  "rounded px-1.5 py-0.5 " +
                  (block.interactivity === "static"
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning")
                }
              >
                {INTERACTIVITY_LABEL[block.interactivity]}
              </span>
              {variants.length > 1 && (
                <span className="text-white/55">
                  {variants.length} layouts
                </span>
              )}
            </div>

            {/*
              The limitation sits on the CARD, at the moment of choosing.
              Discovering afterwards that half a block doesn't work is exactly
              the experience this tool is meant to replace.
            */}
            {block.limitation && (
              <p className="mt-2 text-xs text-warning/90">{block.limitation}</p>
            )}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Layout chooser for the selected block. Separate from the gallery because it
 * only makes sense once a type is chosen, and because a merchant changing
 * layout is doing something different from a merchant changing block.
 */
export function VariantPicker({
  type,
  value,
  onChange,
}: {
  type: CatalogBlockType;
  value: string | null | undefined;
  onChange: (variant: string) => void;
}) {
  const variants = BLOCK_VARIANTS[type] ?? [];
  if (variants.length < 2) return null;
  const current = variants.find((v) => v.id === value) ?? variants[0];

  return (
    <div>
      <p id="ev-layout-label" className="text-xs uppercase tracking-widest text-white/55">
        Layout
      </p>
      {/* Same radio-group reasoning as the gallery above. */}
      <div
        role="radiogroup"
        aria-labelledby="ev-layout-label"
        className="mt-2 flex flex-wrap gap-2"
      >
        {variants.map((v) => (
          <label
            key={v.id}
            className={
              // min-h-11 is the 44px touch target the rest of the app holds to;
              // px-3 py-2 on 12px type came out at about 33, which is a miss on
              // a control a merchant taps repeatedly while comparing layouts.
              "inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-xs transition-colors " +
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-champagne-400/60 " +
              (current.id === v.id
                ? "border-champagne-400/50 bg-champagne-400/10 text-white"
                : "border-white/[0.08] text-white/70 hover:text-white hover:border-white/20")
            }
          >
            <input
              type="radio"
              name={`ev-variant-${type}`}
              value={v.id}
              checked={current.id === v.id}
              onChange={() => onChange(v.id)}
              className="sr-only"
            />
            {v.name}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/55">
        {current.summary}{" "}
        <span className="text-white/45">On a phone: {current.mobile.toLowerCase()}</span>
      </p>
    </div>
  );
}
