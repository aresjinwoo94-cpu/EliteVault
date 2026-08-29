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

/** One structural grey and one accent, shared by every diagram. */
const DIAGRAM = {
  line: "rgb(255 255 255 / 0.38)",
  faint: "rgb(255 255 255 / 0.20)",
  panel: "rgb(255 255 255 / 0.07)",
  accent: "#2DD4BF",
} as const;

/**
 * A short text line — the shared vocabulary of the diagrams below.
 *
 * Module scope, not inside Thumb: a component declared during render is a
 * new component TYPE on every render, so React remounts its whole subtree
 * rather than updating it. Harmless for nine static rects, wrong as a habit,
 * and the lint rule that says so is right.
 */
function Line({
  x,
  y,
  w,
  h = 3,
  o = 1,
  fill = DIAGRAM.line,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  o?: number;
  fill?: string;
}) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} opacity={o} />;
}

/**
 * A tiny inline diagram per block type.
 *
 * # Why a schematic and not a screenshot
 * A thumbnail of a real store's block would be someone else's design, and would
 * promise a specific look we cannot honour: every block is rendered in the
 * MERCHANT's measured tokens, so two stores get two different-looking versions
 * of the same choice. A shape conveys the layout without lying about the
 * styling. That is also why the palette here is deliberately neutral — one
 * accent and one grey — rather than anything resembling a storefront.
 *
 * # Why each one is drawn rather than shared
 * The first version had five branches and four types with none, so spec_table,
 * assurance_bar, bundle_tiers and low_stock rendered an EMPTY box. A card whose
 * picture is blank reads as "not finished" rather than "not illustrated", and
 * it was the four newest blocks — the ones most in need of explaining — that
 * had it. Every type now has a silhouette that is recognisable at thumbnail
 * size and distinguishable from its neighbours at a glance.
 *
 * No external images and no icon library: this renders inside a grid of nine,
 * and nine network requests to explain nine choices is the bloat the product
 * argues against.
 */
function Thumb({ type }: { type: CatalogBlockType }) {
  const { line, faint, panel, accent } = DIAGRAM;

  return (
    <svg
      viewBox="0 0 120 64"
      className="w-full h-auto rounded-md bg-white/[0.03]"
      /*
       * Decorative, and deliberately so. The card already carries the block's
       * name and a sentence describing it, both of which a screen reader
       * announces; a described diagram would repeat that as a second, vaguer
       * version of the same thing. The picture is here to speed up a visual
       * scan, and it has no information the text lacks.
       */
      aria-hidden="true"
      focusable="false"
    >
      {/* ── You vs them: your column lifted, ticked, in the accent ────────── */}
      {type === "comparison" && (
        <>
          <rect x="8" y="8" width="48" height="48" rx="3" fill={accent} opacity="0.12" />
          <rect x="8" y="8" width="48" height="10" rx="3" fill={accent} opacity="0.55" />
          <rect x="64" y="8" width="48" height="48" rx="3" fill={panel} />
          <rect x="64" y="8" width="48" height="10" rx="3" fill={faint} />
          {[26, 38, 50].map((y) => (
            <g key={y}>
              {/* ✓ for you */}
              <path
                d={`M14 ${y - 0.5} l2.5 2.5 l4.5 -5`}
                stroke={accent}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Line x={25} y={y - 2} w={24} />
              {/* ✗ for them, muted — the alternative is not shouted down */}
              <path
                d={`M70 ${y - 3} l5 5 M75 ${y - 3} l-5 5`}
                stroke={line}
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.7"
              />
              <Line x={81} y={y - 2} w={24} o={0.55} />
            </g>
          ))}
        </>
      )}

      {/* ── Trust icons: a row of four marks, each captioned ──────────────── */}
      {type === "trust_icons" && (
        <>
          {[
            // shield
            "M0 -6 l6 2.5 v4 c0 3.5 -2.5 6 -6 7.5 c-3.5 -1.5 -6 -4 -6 -7.5 v-4 z",
            // truck
            "M-7 -4 h8 v8 h-8 z M1 -1 h4 l2 3 v2 h-6 z",
            // return arrow
            "M4 -3 a6 6 0 1 0 1.5 5 M4 -3 h-4 M4 -3 v4",
            // padlock
            "M-4 -1 h8 v6 h-8 z M-2.5 -1 v-2.5 a2.5 2.5 0 0 1 5 0 v2.5",
          ].map((d, i) => {
            const cx = 20 + i * 27;
            return (
              <g key={cx}>
                <circle cx={cx} cy="24" r="11" fill={accent} opacity="0.12" />
                <g transform={`translate(${cx} 24)`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={accent}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                </g>
                <Line x={cx - 9} y={42} w={18} />
              </g>
            );
          })}
        </>
      )}

      {/* ── Feature grid: cards of icon + two lines ───────────────────────── */}
      {type === "feature_grid" && (
        <>
          {[8, 44, 80].map((x) => (
            <g key={x}>
              <rect x={x} y="10" width="32" height="44" rx="3" fill={panel} />
              <circle cx={x + 11} cy="22" r="6" fill={accent} opacity="0.55" />
              <Line x={x + 5} y={34} w={22} />
              <Line x={x + 5} y={41} w={16} o={0.55} />
            </g>
          ))}
        </>
      )}

      {/* ── Brand cards: a headline, then the story beneath it ────────────── */}
      {type === "brand_cards" && (
        <>
          <rect x="10" y="10" width="42" height="7" rx="3.5" fill={accent} opacity="0.6" />
          <Line x={10} y={23} w={92} h={4} />
          <Line x={10} y={31} w={70} h={4} o={0.6} />
          {[42, 50].map((y) => (
            <g key={y}>
              <circle cx="13" cy={y + 2} r="2.5" fill={accent} opacity="0.6" />
              <Line x={20} y={y} w={62} />
            </g>
          ))}
        </>
      )}

      {/* ── Product stats: label, then the figure as a bar ────────────────── */}
      {type === "product_stats" && (
        <>
          {[
            [14, 70],
            [28, 44],
            [42, 56],
          ].map(([y, w]) => (
            <g key={y}>
              <Line x={10} y={y} w={26} h={4} />
              <rect x={42} y={y - 1} width={w} height="6" rx="3" fill={accent} opacity="0.5" />
            </g>
          ))}
        </>
      )}

      {/* ── Spec table: key / value, divided ──────────────────────────────── */}
      {type === "spec_table" && (
        <>
          {[12, 26, 40].map((y, i) => (
            <g key={y}>
              {/* The zebra tint is the block's own default variant */}
              {i % 2 === 0 && (
                <rect x="8" y={y - 3} width="104" height="13" rx="2" fill={panel} />
              )}
              <Line x={13} y={y} w={30} h={4} o={0.7} />
              <Line x={54} y={y} w={52} h={4} />
            </g>
          ))}
          {/* the divider that gives the pattern its shape */}
          <rect x="49" y="7" width="1" height="46" fill={faint} />
        </>
      )}

      {/* ── Assurance bar: one quiet strip, centred ───────────────────────── */}
      {type === "assurance_bar" && (
        <>
          <rect x="8" y="22" width="104" height="20" rx="6" fill={accent} opacity="0.1" />
          <g transform="translate(42 32)">
            <path
              d="M0 -6 l6 2.5 v4 c0 3.5 -2.5 6 -6 7.5 c-3.5 -1.5 -6 -4 -6 -7.5 v-4 z"
              fill="none"
              stroke={accent}
              strokeWidth="1.8"
              strokeLinejoin="round"
              opacity="0.9"
            />
          </g>
          <Line x={54} y={30} w={26} h={4} />
        </>
      )}

      {/* ── Volume pricing: stacked tiers, the middle one badged ──────────── */}
      {type === "bundle_tiers" && (
        <>
          {[
            { y: 6, pop: false },
            { y: 24, pop: true },
            { y: 42, pop: false },
          ].map(({ y, pop }) => (
            <g key={y}>
              <rect
                x="8"
                y={y}
                width="104"
                height="16"
                rx="3"
                fill={pop ? accent : panel}
                opacity={pop ? 0.14 : 1}
                stroke={pop ? accent : "none"}
                strokeWidth="1"
                strokeOpacity="0.55"
              />
              {/* qty */}
              <Line x={14} y={y + 6} w={16} h={4} o={0.8} />
              {/* price */}
              <Line x={62} y={y + 6} w={20} h={4} o={0.9} />
              {/* saving pill */}
              <rect
                x={88}
                y={y + 4}
                width="18"
                height="8"
                rx="4"
                fill={accent}
                opacity={pop ? 0.75 : 0.35}
              />
              {pop && (
                /* the POPULAR ribbon, as a notch on the edge */
                <rect x="14" y={y - 3} width="26" height="6" rx="3" fill={accent} opacity="0.9" />
              )}
            </g>
          ))}
        </>
      )}

      {/* ── Low stock: a partly-drained bar, and the line above it ────────── */}
      {type === "low_stock" && (
        <>
          <circle cx="13" cy="24" r="3.5" fill={accent} opacity="0.9" />
          <Line x={22} y={22} w={44} h={4} o={0.85} />
          <rect x="8" y="36" width="104" height="7" rx="3.5" fill={panel} />
          {/* Partly filled on purpose: a full bar would read as "in stock" */}
          <rect x="8" y="36" width="31" height="7" rx="3.5" fill={accent} opacity="0.75" />
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
              "group block cursor-pointer text-left rounded-xl border p-4 transition-colors " +
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
            {/*
              A half-pixel lift on hover, and nothing else.
              `motion-safe:` compiles to @media (prefers-reduced-motion:
              no-preference), so a visitor who has asked their OS for less
              motion gets no transition at all rather than a shorter one — the
              diagram is the point here, the movement is a nicety.
            */}
            <div className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:group-hover:-translate-y-0.5">
              <Thumb type={block.id} />
            </div>

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
