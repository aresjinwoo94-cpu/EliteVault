/**
 * Liquid Blocks WP-F — the variant library, as DATA.
 *
 * Every visual variant of every block type is an entry in this file. The
 * renderer switches on `variant`, the gallery is generated from these entries,
 * and adding a variant is adding a row — not a branch in three files that drift.
 *
 * # Why data rather than code
 * The brief asks for a catalogue a merchant BROWSES, which means the catalogue
 * has to be enumerable: names, descriptions, what each looks like, what it
 * needs. A `switch` can't be listed, sorted or filtered, and the picker would
 * end up with its own hardcoded copy of the options that silently disagrees
 * with the renderer the first time someone adds one.
 *
 * # Every variant cites a reference
 * `reference` points into lib/blocks/design-references.md. That file is the
 * source these come from — the product's claim is that these blocks replace
 * several Shopify apps, and that only holds if they're modelled on what those
 * apps converged on rather than invented at a keyboard. A variant nobody can
 * trace back to a reference is a variant nobody can defend.
 *
 * # The invariant that makes variants safe
 * A variant changes LAYOUT ONLY. It may not add content, may not introduce a
 * claim, and may not make a block say more than the merchant typed. That's what
 * lets us offer visual choice without reopening the truthfulness rule the whole
 * feature rests on — and a test enforces it by rendering every variant of every
 * type against identical input and comparing the text that comes out.
 */

import type { CatalogBlockType } from "./catalog";

/**
 * How much of the market pattern we actually deliver. Recorded per block rather
 * than left to judgement, and shown to the merchant BEFORE they choose.
 */
export type Interactivity =
  /** Works completely as pure Liquid. What the preview shows is what ships. */
  | "static"
  /**
   * The category leaders ship an interactive version; we ship the visual form
   * and say so. Never imitated with controls that don't work — a shopper who
   * clicks a dead control concludes the STORE is broken.
   */
  | "presentational";

export interface BlockVariant {
  /** Stable id, stored on the spec. Never renamed — saved projects hold it. */
  id: string;
  /** Shown in the gallery. */
  name: string;
  /** One line: what makes this one different from its siblings. */
  summary: string;
  /** How it behaves under 640px, because a variant that ignores this is a bug. */
  mobile: string;
  /** Heading in lib/blocks/design-references.md this is modelled on. */
  reference: string;
}

/**
 * Variants by block type.
 *
 * The FIRST entry of each list is the default — what a merchant gets before
 * they touch anything — so it should be the most broadly safe rather than the
 * most striking.
 */
export const BLOCK_VARIANTS: Record<CatalogBlockType, BlockVariant[]> = {
  comparison: [
    {
      id: "two_col",
      name: "You vs them",
      summary:
        "Two columns, your side lifted with a tinted panel and an accent header.",
      mobile: "Columns stay side by side; row labels wrap above their cells.",
      reference: "2. Comparison “us vs them”",
    },
    {
      id: "three_col",
      name: "You vs them vs everyone",
      summary:
        "Three columns — you, the one they named, and the rest of the category.",
      mobile: "Scrolls horizontally rather than crushing three columns to nothing.",
      reference: "2. Comparison “us vs them”",
    },
    {
      id: "checklist",
      name: "Checklist",
      summary:
        "No grid — one line per benefit, ticked for you and struck through for them.",
      mobile: "Reads as a single column list, which is its natural shape.",
      reference: "2. Comparison “us vs them”",
    },
  ],

  trust_icons: [
    {
      id: "row_line",
      name: "Line icons",
      summary: "A quiet row of outline icons. Reads as part of the theme.",
      mobile: "Wraps to a 2×2 grid rather than shrinking below legibility.",
      reference: "1. Trust / benefit icons",
    },
    {
      id: "boxed",
      name: "Boxed",
      summary: "Each reassurance in its own bordered tile, for busier pages.",
      mobile: "Two per row.",
      reference: "1. Trust / benefit icons",
    },
    {
      id: "stacked_2x2",
      name: "Stacked pairs",
      summary: "Icon beside the label, two per row — fits a narrow column.",
      mobile: "One per row, icon left.",
      reference: "1. Trust / benefit icons",
    },
  ],

  feature_grid: [
    {
      id: "cards_3",
      name: "Three cards",
      summary: "Icon in an accent circle, a bold title, one line. The default shape.",
      mobile: "Stacks to one column.",
      reference: "3. Feature / benefit grid",
    },
    {
      id: "cards_2",
      name: "Two cards",
      summary: "Wider cards for two strong features rather than three thin ones.",
      mobile: "Stacks to one column.",
      reference: "3. Feature / benefit grid",
    },
    {
      id: "cards_4",
      name: "Four cards",
      summary: "A 2×2 block. Use when four features genuinely earn their place.",
      mobile: "Two per row.",
      reference: "3. Feature / benefit grid",
    },
  ],

  brand_cards: [
    {
      id: "promise_led",
      name: "Promise first",
      summary: "Your one-line promise, then the benefits beneath it.",
      mobile: "Single column.",
      reference: "3. Feature / benefit grid",
    },
    {
      id: "logo_led",
      name: "Logo first",
      summary: "Your mark above the promise, for brands people recognise.",
      mobile: "Single column, logo centred.",
      reference: "3. Feature / benefit grid",
    },
  ],

  product_stats: [
    {
      id: "tiles",
      name: "Tiles",
      summary: "Each figure in its own tile with its unit.",
      mobile: "Two per row.",
      reference: "6. Specs / size table",
    },
    {
      id: "bars",
      name: "Bars",
      summary: "Figures as proportional bars, when they share a scale.",
      mobile: "Full width, stacked.",
      reference: "6. Specs / size table",
    },
  ],

  spec_table: [
    {
      id: "zebra",
      name: "Zebra",
      summary:
        "Alternating row tints. Easiest to track across on a long list of specs.",
      mobile: "Label above value, so a long dimension never gets crushed.",
      reference: "6. Specs / size table",
    },
    {
      id: "divided",
      name: "Divided",
      summary: "Hairline rules instead of fills — quieter on a busy page.",
      mobile: "Label above value, same as zebra.",
      reference: "6. Specs / size table",
    },
    {
      id: "two_column",
      name: "Two columns",
      summary: "Pairs side by side, for when the list is long but each value is short.",
      mobile: "Collapses to one column — two columns of specs on a phone is unreadable.",
      reference: "6. Specs / size table",
    },
  ],

  assurance_bar: [
    {
      id: "single_strip",
      name: "Single strip",
      summary: "One centred line on a soft tint. The pattern in its plainest form.",
      mobile: "Icon above the text, centred.",
      reference: "5. Guarantee / delivery estimate",
    },
    {
      id: "split_two",
      name: "Split",
      summary: "Two promises side by side, divided down the middle.",
      mobile: "Stacks; the divider becomes a horizontal rule.",
      reference: "5. Guarantee / delivery estimate",
    },
  ],

  bundle_tiers: [
    {
      id: "stacked",
      name: "Stacked",
      summary: "One row per tier, quantity left, price and saving right.",
      mobile: "Its natural shape — nothing changes.",
      reference: "4. Bundle / volume pricing",
    },
    {
      id: "side_by_side",
      name: "Side by side",
      summary: "Tiers as cards across, with the popular one lifted.",
      mobile: "Stacks to one column rather than shrinking the prices.",
      reference: "4. Bundle / volume pricing",
    },
  ],

  low_stock: [
    {
      id: "bar",
      name: "Stock bar",
      summary: "The message with a thin depletion bar beneath it.",
      mobile: "Full width; the bar keeps its height.",
      reference: "7. Low stock / scarcity",
    },
    {
      id: "inline",
      name: "Inline",
      summary: "Just the line, with a dot. For pages that already have enough going on.",
      mobile: "Unchanged — it is one line.",
      reference: "7. Low stock / scarcity",
    },
  ],
};

/** The variant a block gets before the merchant chooses one. */
export function defaultVariant(type: CatalogBlockType): string {
  return BLOCK_VARIANTS[type][0].id;
}

/**
 * Resolve a stored variant id, falling back to the default.
 *
 * Never throws and never renders nothing: a project saved before this file
 * existed has no variant at all, and a project saved against a variant that was
 * later withdrawn must still open. Both cases get the default rather than an
 * error — the merchant's content is intact either way, and the layout is the
 * part that can safely change under them.
 */
export function resolveVariant(
  type: CatalogBlockType,
  variant: string | null | undefined,
): BlockVariant {
  const list = BLOCK_VARIANTS[type];
  return list.find((v) => v.id === variant) ?? list[0];
}

/** True when `variant` is a known id for `type`. Used by the validator. */
export function isKnownVariant(
  type: CatalogBlockType,
  variant: string | null | undefined,
): boolean {
  if (variant === null || variant === undefined) return true; // absent = default
  return BLOCK_VARIANTS[type].some((v) => v.id === variant);
}
