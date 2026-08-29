/**
 * Liquid Blocks WP-C — the four MVP blocks, and the rule that governs them.
 *
 * # Why every block demands data from the user
 * The brief's hard line: a block that carries CLAIMS is never autofilled with
 * invented data. "Free shipping in 3 days", "2-year warranty", "we beat them on
 * price" — none of it is knowable from a product endpoint, and a generator that
 * guesses produces a storefront that lies to shoppers on the merchant's behalf.
 * That's the difference between this and asking a chatbot for a trust-badge
 * snippet: the chatbot will happily invent all four badges, and the merchant
 * won't notice until someone holds them to one.
 *
 * So the validator REFUSES an incomplete spec rather than completing it, and it
 * names what's missing so the UI can ask for exactly that. What it deliberately
 * does NOT check is whether the claims are true — we can't know. What it
 * guarantees is that every claim came from the merchant, who can stand behind
 * it, rather than from us.
 *
 * WP-B's `product_facts` is the one block outside this rule, and it earns the
 * exemption by saying nothing the store's own product endpoint didn't tell us.
 */

import { isKnownVariant, type Interactivity } from "./variants";

/** Icons a trust row may use. A closed set — the renderer draws them inline. */
export const TRUST_ICONS = [
  "shipping",
  "returns",
  "warranty",
  "secure-payment",
  "support",
  "sustainable",
] as const;
export type TrustIcon = (typeof TRUST_ICONS)[number];

export interface TrustItemInput {
  icon: TrustIcon | string;
  /** The claim itself — required. */
  label: string;
  /** Optional supporting line. */
  detail: string;
}

export interface ComparisonRowInput {
  label: string;
  ours: string;
  theirs: string;
  weWin: boolean;
}

export interface FeatureItemInput {
  /** One of TRUST_ICONS — drawn inline, no runtime request. */
  icon: TrustIcon | string;
  /** The feature, in a few words. */
  title: string;
  /**
   * Exactly one line of explanation.
   *
   * The single-line discipline IS the pattern (see design-references.md §3): a
   * grid where one card runs to four lines stops being scannable and becomes an
   * unread paragraph in a box. Enforced by a cap, not by hoping.
   */
  line: string;
}

export interface ProductStatInput {
  label: string;
  /** Digits. Prose belongs in a claims block, not a stats one. */
  value: string;
  unit: string;
}

export interface SpecRowInput {
  /** "Material", "Dimensions", "Care" — the thing being specified. */
  label: string;
  /** The merchant's own answer. Prose is fine here; it is a spec sheet. */
  value: string;
}

export interface AssuranceItemInput {
  icon: TrustIcon | string;
  /** The reassurance itself, in the merchant's words. */
  text: string;
}

export interface BundleTierInput {
  /** How many units this tier is for. 1 is the baseline and needs no discount. */
  quantity: number;
  /** Percentage off, as the merchant sets it in their own discount rules. */
  discountPercent: number;
  /** The "most popular" ribbon. At most one tier may carry it. */
  highlight: boolean;
}

/**
 * The visual variant, from lib/blocks/variants.ts.
 *
 * OPTIONAL on every member on purpose: projects saved before variants existed
 * carry none, and must keep opening. An absent or withdrawn variant resolves to
 * the type default rather than erroring — the merchant's content is intact
 * either way, and layout is the part that can safely change under them.
 */
type WithVariant = { variant?: string | null };

export type BlockSpecInput =
  | ({ type: "trust_icons"; items: TrustItemInput[] } & WithVariant)
  | ({
      type: "brand_cards";
      promise: string;
      benefits: string[];
      logoUrl: string | null;
    } & WithVariant)
  | ({
      type: "comparison";
      competitorName: string;
      rows: ComparisonRowInput[];
      /**
       * The third column, for the three-column variant: the rest of the
       * category. Optional, and named by the merchant like the first one — we
       * autofill no competitor, ever.
       */
      othersName?: string | null;
    } & WithVariant)
  | ({ type: "feature_grid"; features: FeatureItemInput[] } & WithVariant)
  | ({ type: "product_stats"; stats: ProductStatInput[] } & WithVariant)
  | ({ type: "spec_table"; rows: SpecRowInput[] } & WithVariant)
  | ({ type: "assurance_bar"; items: AssuranceItemInput[] } & WithVariant)
  | ({
      type: "bundle_tiers";
      /**
       * The tiers, as percentages. The MONEY is never stored — it is computed
       * from `product.price` at render time, in Liquid for the export and from
       * the measured product for the preview.
       *
       * That is the whole point of the block: a merchant who changes their
       * price should not discover months later that a bundle panel is quoting
       * the old one. A stored amount would be correct exactly once.
       */
      tiers: BundleTierInput[];
    } & WithVariant)
  | ({
      type: "low_stock";
      /**
       * Show the block only when stock is at or below this.
       *
       * Also the figure the PREVIEW illustrates with, so no number here was
       * invented by us: the merchant chose it. The exported Liquid never uses
       * it as a count — it reads `inventory_quantity` live — which is the only
       * way the number stays true after export.
       */
      threshold: number;
    } & WithVariant);

export type CatalogBlockType = BlockSpecInput["type"];

export type ValidateResult =
  | { ok: true; spec: BlockSpecInput; warnings: string[] }
  | { ok: false; missing: string[] };

/** What the UI needs to build a form and explain a block. */
export interface CatalogEntry {
  id: CatalogBlockType;
  name: string;
  /** One line, for the picker. */
  summary: string;
  /** Plain-language list of what the merchant must supply. */
  requires: string[];
  /** Where the block belongs on a product page, for the install instructions. */
  placement: string;
  /**
   * Heading in lib/blocks/design-references.md this block is modelled on.
   * Every entry cites one — a block nobody can trace to a reference is a block
   * nobody can defend.
   */
  reference: string;
  /**
   * How much of the market pattern we actually deliver, shown to the merchant
   * BEFORE they pick. "presentational" means the category leaders ship an
   * interactive version and we ship the visual form only.
   */
  interactivity: Interactivity;
  /**
   * Set on a presentational block: what it does NOT do, in the merchant's own
   * terms, rendered beside it in the gallery. Saying this late — or not at all —
   * is how a shopper ends up clicking something dead and concluding the STORE
   * is broken.
   */
  limitation?: string;
}

export const BLOCK_CATALOG: CatalogEntry[] = [
  {
    id: "comparison",
    name: "You vs them",
    summary:
      "The comparison your buyer is already making in their head — done properly, with the alternative named.",
    requires: [
      "The competitor, by name",
      "The rows to compare (price, materials, delivery…)",
      "Your value and theirs for each row",
    ],
    placement: "Under the product description",
    reference: "2. Comparison “us vs them”",
    interactivity: "static",
  },
  {
    id: "trust_icons",
    name: "Trust icons",
    summary:
      "A row of reassurances — shipping, returns, warranty, secure payment — in your store's own colours.",
    requires: [
      "Your actual shipping time or cost",
      "Your actual returns window",
      "Your actual warranty, if you offer one",
      "Which payment methods you really accept",
    ],
    placement: "Directly under the Add to cart button",
    reference: "1. Trust / benefit icons",
    interactivity: "static",
  },
  {
    id: "feature_grid",
    name: "Feature grid",
    summary:
      "Two to four of this PRODUCT’s concrete features — icon, title, one line each.",
    requires: [
      "Two to four real features of this product",
      "One line explaining each",
    ],
    placement: "Under the product description",
    reference: "3. Feature / benefit grid",
    interactivity: "static",
  },
  {
    id: "brand_cards",
    name: "Brand cards",
    summary:
      "Your BRAND’s story — one promise and the benefits behind it. (For product features, use the Feature grid.)",
    requires: [
      "Your promise in one sentence",
      "Three or four concrete benefits",
      "Your logo (optional)",
    ],
    placement: "Under the product description",
    reference: "3. Feature / benefit grid",
    interactivity: "static",
  },
  {
    id: "product_stats",
    name: "Product stats",
    summary: "Real numbers about this product — the ones you can back up.",
    requires: ["At least one real figure, with a label"],
    placement: "Under the price, or under the description",
    reference: "6. Specs / size table",
    interactivity: "static",
  },
  {
    id: "spec_table",
    name: "Spec table",
    summary:
      "Material, dimensions, weight, care — the fact a shopper leaves to go and look up.",
    requires: ["At least two specs, each with a label and your own answer"],
    placement: "Under the product description",
    reference: "6. Specs / size table",
    interactivity: "static",
  },
  {
    id: "assurance_bar",
    name: "Assurance bar",
    summary:
      "One quiet strip under the button — the guarantee or delivery promise that removes the last objection.",
    requires: ["Your actual guarantee or delivery promise, in one line"],
    placement: "Directly under the Add to cart button",
    reference: "5. Guarantee / delivery estimate",
    interactivity: "static",
  },
  {
    id: "bundle_tiers",
    name: "Volume pricing",
    summary:
      "What buying two or three actually costs, priced live from your product — so it stays right when you change the price.",
    requires: [
      "The quantities you offer a discount on",
      "The percentage off each one, matching your real discount rules",
    ],
    placement: "Under the price, above Add to cart",
    reference: "4. Bundle / volume pricing",
    interactivity: "presentational",
    // The owner rejected an earlier draft that kept a radio affordance "for
    // fidelity". A shopper who clicks a dead control concludes the STORE is
    // broken, and the merchant pays for our fidelity with their trust. Said
    // here, before they choose, and repeated inside the block itself.
    limitation: "Shows volume pricing; doesn't add to cart",
  },
  {
    id: "low_stock",
    name: "Low stock",
    summary:
      "“Only a few left”, read live from your theme's real inventory — never a number frozen at export.",
    requires: ["The stock level below which you want it to appear"],
    placement: "Directly under the price",
    reference: "7. Low stock / scarcity",
    interactivity: "static",
    // Honest about where the preview stands: the public product endpoint we
    // measure from returns `available` as a boolean and no quantity, so the
    // preview cannot show the real figure. The export can, and does.
    limitation: "Preview shows your threshold as an example; the export reads live stock",
  },
];

/**
 * Field caps. Over-long input is REFUSED rather than truncated: truncation
 * publishes half a sentence on someone's storefront, and they find out from a
 * customer.
 */
const MAX = {
  label: 60,
  detail: 120,
  promise: 160,
  benefit: 90,
  competitor: 60,
  featureTitle: 40,
  // One LINE. The cap is the pattern, not a safety margin — see
  // design-references.md §3.
  featureLine: 100,
  cellValue: 40,
  statLabel: 40,
  statValue: 12,
  unit: 8,
  // A spec answer is prose ("100% merino, machine washable at 30°"), so it
  // gets more room than a comparison cell — but still a cap, because a spec
  // table with a paragraph in it stops being scannable, which is the pattern.
  specValue: 160,
} as const;

const MAX_ITEMS = {
  trust: 6,
  benefits: 6,
  rows: 8,
  stats: 6,
  features: 4,
  specRows: 12,
  // See design-references.md §5: the strip is a floor under the decision, not
  // a second trust row.
  assurance: 2,
  tiers: 4,
} as const;

/**
 * Materialise an array so HOLES become `undefined` instead of vanishing.
 *
 * `[ , {…}]` is a sparse array, and every iteration method the validator used —
 * `forEach`, `some`, `filter` — SKIPS holes silently. So a spec whose first
 * tier was a hole validated clean and then threw inside the renderer:
 * "Cannot read properties of undefined (reading 'discountPercent')". A
 * validator returning ok on input the renderer cannot render is worse than one
 * that refuses too much.
 *
 * `Array.from` fills the holes, and the `isRecord` guard on each member then
 * rejects them with a message naming the position.
 */
function members(value: unknown): unknown[] {
  return Array.isArray(value) ? Array.from(value) : [];
}

function filled(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** A plain object we can read fields off without throwing. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Liquid delimiters in a merchant's own copy.
 *
 * The renderer neutralises these too (see `esc`), so this is defence in depth —
 * but it's the half that TELLS them. Silently turning their braces into
 * entities would leave someone wondering why the page shows the characters
 * literally; refusing here explains it before they publish.
 */
const LIQUID_DELIMITERS = /\{\{|\}\}|\{%|%\}/;

/** True for something a stats block can legitimately plot. */
function isNumeric(value: string): boolean {
  return /^-?\d{1,9}(\.\d{1,4})?$/.test(value.trim());
}

function httpsOrNull(raw: string | null): boolean {
  if (raw === null || raw === "") return true;
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateBlockSpec(spec: BlockSpecInput): ValidateResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  /**
   * Fail closed on anything unrecognised.
   *
   * The switch below used to have no default, so a spec with an unknown or
   * missing `type` validated clean, was persisted, and then rendered as
   * product_facts — the merchant approved one block and their theme received a
   * different one. A validator that doesn't understand its input has exactly
   * one correct answer.
   */
  if (!isRecord(spec)) {
    return { ok: false, missing: ["That isn't a block."] };
  }
  const KNOWN: string[] = BLOCK_CATALOG.map((b) => b.id);
  if (typeof spec.type !== "string" || !KNOWN.includes(spec.type)) {
    return { ok: false, missing: ["Pick one of the block types."] };
  }

  // Layout only, so an unknown id is not worth refusing the merchant content
  // over — but a TYPO should not silently become the default either. Warned,
  // and resolveVariant falls back when it renders.
  if (!isKnownVariant(spec.type, (spec as { variant?: string | null }).variant)) {
    warnings.push("That layout no longer exists — using the default for this block.");
  }

  const tooLong = (what: string, value: string, cap: number) => {
    if (value.trim().length > cap) missing.push(`${what} is too long (max ${cap} characters)`);
  };
  /** Every merchant-typed string goes through here. */
  const text = (what: string, value: unknown, cap: number): string | null => {
    if (!filled(value)) return null;
    tooLong(what, value, cap);
    if (LIQUID_DELIMITERS.test(value)) {
      missing.push(
        `${what}: remove the {{ }} or {% %} — those are Liquid tags and they'd break your theme.`,
      );
    }
    return value;
  };

  switch (spec.type) {
    case "trust_icons": {
      const trustItems = members(spec.items);
      if (!Array.isArray(spec.items) || trustItems.length === 0) {
        missing.push("At least one trust item — we don't invent these");
        break;
      }
      if (trustItems.length > MAX_ITEMS.trust) {
        missing.push(`Too many trust items (max ${MAX_ITEMS.trust})`);
      }
      trustItems.forEach((item, i) => {
        if (!isRecord(item)) {
          missing.push(`Trust item ${i + 1} is malformed.`);
          return;
        }
        // The label IS the claim, so it's the one required part. The detail
        // line only elaborates, and plenty of merchants have nothing to add.
        if (!text(`Trust item ${i + 1}`, item.label, MAX.label)) {
          missing.push(`Trust item ${i + 1}: what does it say?`);
        }
        if (item.detail !== undefined && item.detail !== null) {
          text(`Trust item ${i + 1} detail`, item.detail, MAX.detail);
        }
        // An unrecognised icon used to fall back to the shipping truck, so
        // "Made in Italy" rendered beside a delivery van — a signal the
        // merchant never chose, on a block whose entire job is trust.
        if (!TRUST_ICONS.includes(item.icon as TrustIcon)) {
          missing.push(`Trust item ${i + 1}: pick an icon from the list.`);
        }
      });
      break;
    }

    case "brand_cards": {
      if (!text("The promise", spec.promise, MAX.promise)) {
        missing.push("Your promise, in one sentence");
      }

      // `.filter(filled)` also drops non-strings, so a benefit of `5` becomes
      // "too few benefits" rather than a crash in the renderer.
      const benefits = members(spec.benefits).filter(filled);
      if (benefits.length < 3) {
        missing.push("At least three benefits (a card with one line looks unfinished)");
      }
      if (benefits.length > MAX_ITEMS.benefits) {
        missing.push(`Too many benefits (max ${MAX_ITEMS.benefits})`);
      }
      benefits.forEach((b, i) => text(`Benefit ${i + 1}`, b, MAX.benefit));
      // A non-string in the list is silently excluded above, which would let a
      // malformed payload through as "three benefits" while the renderer sees
      // four and throws on the fourth.
      if (members(spec.benefits).some((b) => typeof b !== "string")) {
        missing.push("One of the benefits isn't text.");
      }

      if (!httpsOrNull(spec.logoUrl)) {
        missing.push("The logo must be an https:// image URL");
      }
      break;
    }

    case "comparison": {
      if (spec.othersName !== undefined && spec.othersName !== null) {
        // Optional third column. Named by the merchant like the first one — we
        // autofill no competitor, ever, not even a generic "Others".
        text("The third column name", spec.othersName, MAX.competitor);
      }
      if (!text("The competitor name", spec.competitorName, MAX.competitor)) {
        // A comparison is a claim ABOUT SOMEONE. It needs a subject the
        // merchant chose deliberately — that's both honest and their legal
        // exposure, not ours to guess at.
        missing.push("Competitor: what you're comparing against, by name");
      }

      const rows = members(spec.rows);
      if (rows.length === 0) missing.push("At least one row to compare");
      if (rows.length > MAX_ITEMS.rows) missing.push(`Too many rows (max ${MAX_ITEMS.rows})`);
      rows.forEach((row, i) => {
        if (!isRecord(row)) {
          missing.push(`Row ${i + 1} is malformed.`);
          return;
        }
        if (!text(`Row ${i + 1} label`, row.label, MAX.statLabel)) {
          missing.push(`Row ${i + 1}: what are you comparing?`);
        }
        if (!text(`Row ${i + 1} (yours)`, row.ours, MAX.cellValue)) {
          missing.push(`Row ${i + 1}: your value`);
        }
        if (!text(`Row ${i + 1} (theirs)`, row.theirs, MAX.cellValue)) {
          missing.push(`Row ${i + 1}: their value`);
        }
      });

      // Allowed — it might be true — but a table the competitor loses outright
      // reads as marketing rather than comparison, and a shopper discounts the
      // whole thing. Better said now than discovered from the conversion rate.
      if (rows.length >= 3 && rows.every((r) => isRecord(r) && r.weWin === true)) {
        warnings.push(
          "You win every row. A comparison where the alternative never wins reads as an ad — conceding one honest point usually makes the rest more believable.",
        );
      }
      break;
    }

    case "feature_grid": {
      const features = members(spec.features);
      if (features.length < 2) {
        // Two is the floor because one "grid" card is a sentence in a box, and
        // the layout has nothing to be a grid of.
        missing.push("At least two features");
      }
      if (features.length > MAX_ITEMS.features) {
        missing.push(`Too many features (max ${MAX_ITEMS.features})`);
      }
      features.forEach((feature, i) => {
        if (!isRecord(feature)) {
          missing.push(`Feature ${i + 1} is malformed.`);
          return;
        }
        if (!text(`Feature ${i + 1}`, feature.title, MAX.featureTitle)) {
          missing.push(`Feature ${i + 1}: what is it?`);
        }
        if (!text(`Feature ${i + 1} line`, feature.line, MAX.featureLine)) {
          missing.push(`Feature ${i + 1}: one line explaining it`);
        }
        if (!TRUST_ICONS.includes(feature.icon as TrustIcon)) {
          missing.push(`Feature ${i + 1}: pick an icon from the list.`);
        }
      });
      break;
    }

    case "product_stats": {
      const stats = members(spec.stats);
      if (stats.length === 0) {
        // The block the brief singles out: no numbers, no block. It is not
        // offered rather than filled with plausible-looking figures.
        missing.push("At least one real number — without figures this block isn't offered");
        break;
      }
      if (stats.length > MAX_ITEMS.stats) missing.push(`Too many stats (max ${MAX_ITEMS.stats})`);
      stats.forEach((stat, i) => {
        if (!isRecord(stat)) {
          missing.push(`Stat ${i + 1} is malformed.`);
          return;
        }
        if (!text(`Stat ${i + 1} label`, stat.label, MAX.statLabel)) {
          missing.push(`Stat ${i + 1}: what does the number measure?`);
        }
        if (!filled(stat.value) || !isNumeric(stat.value)) {
          // "Loved by everyone" is not a statistic. Letting prose in turns a
          // chart into a claims block wearing a chart's clothes.
          missing.push(`Stat ${i + 1}: a number (prose belongs in Brand cards)`);
        } else tooLong(`Stat ${i + 1} value`, stat.value, MAX.statValue);
        // Optional, but it must be TEXT if present — `undefined` reaching the
        // renderer threw on `.trim()`.
        if (stat.unit !== undefined && stat.unit !== null) {
          if (typeof stat.unit !== "string") missing.push(`Stat ${i + 1}: the unit isn't text.`);
          else text(`Stat ${i + 1} unit`, stat.unit, MAX.unit);
        }
      });
      break;
    }

    case "spec_table": {
      const rows = members(spec.rows);
      if (rows.length < 2) {
        // One row is not a table, and a table is the pattern — see
        // design-references.md §6. A single fact belongs in the description.
        missing.push("At least two specs (one row isn't a table)");
      }
      if (rows.length > MAX_ITEMS.specRows) {
        missing.push(`Too many specs (max ${MAX_ITEMS.specRows})`);
      }
      rows.forEach((row, i) => {
        if (!isRecord(row)) {
          missing.push(`Spec ${i + 1} is malformed.`);
          return;
        }
        if (!text(`Spec ${i + 1} label`, row.label, MAX.statLabel)) {
          missing.push(`Spec ${i + 1}: what does it describe?`);
        }
        // No autofill from the product endpoint, deliberately. Shopify exposes
        // weight and a type, and pulling them would put OUR reading of their
        // catalogue on their page as if they had checked it.
        if (!text(`Spec ${i + 1} value`, row.value, MAX.specValue)) {
          missing.push(`Spec ${i + 1}: your own answer`);
        }
      });
      break;
    }

    case "assurance_bar": {
      const items = members(spec.items);
      if (items.length === 0) {
        missing.push("Your guarantee or delivery promise — we don't invent these");
      }
      if (items.length > MAX_ITEMS.assurance) {
        // Two is the ceiling because the pattern is a FLOOR under the decision,
        // not a second trust row. A strip with four claims competes with the
        // buy button it exists to support (design-references.md §5).
        missing.push(
          `An assurance bar holds one or two promises (max ${MAX_ITEMS.assurance}) — for more, use Trust icons`,
        );
      }
      items.forEach((item, i) => {
        if (!isRecord(item)) {
          missing.push(`Assurance ${i + 1} is malformed.`);
          return;
        }
        if (!text(`Assurance ${i + 1}`, item.text, MAX.detail)) {
          missing.push(`Assurance ${i + 1}: what does it promise?`);
        }
        if (!TRUST_ICONS.includes(item.icon as TrustIcon)) {
          missing.push(`Assurance ${i + 1}: pick an icon from the list.`);
        }
      });
      break;
    }

    case "bundle_tiers": {
      const tiers = members(spec.tiers);
      if (tiers.length < 2) {
        missing.push("At least two tiers (volume pricing needs something to compare)");
      }
      if (tiers.length > MAX_ITEMS.tiers) {
        missing.push(`Too many tiers (max ${MAX_ITEMS.tiers})`);
      }
      const seen = new Set<number>();
      tiers.forEach((tier, i) => {
        if (!isRecord(tier)) {
          missing.push(`Tier ${i + 1} is malformed.`);
          return;
        }
        const qty = tier.quantity;
        if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 99) {
          missing.push(`Tier ${i + 1}: a whole quantity between 1 and 99`);
        } else if (seen.has(qty)) {
          // Two tiers for the same quantity renders two different prices for
          // the same purchase, on the merchant's storefront.
          missing.push(`Tier ${i + 1}: quantity ${qty} is listed twice`);
        } else seen.add(qty);

        const off = tier.discountPercent;
        /*
         * WHOLE percent, not merely finite.
         *
         * A fractional discount passed validation and was written straight
         * into the theme as a float literal — `times: 87.5` — which drags the
         * whole Liquid chain into floating point and hands `money` a
         * non-integer cent value it is not specified for. Reachable by typing
         * a decimal into the composer, not just by a crafted request.
         */
        if (typeof off !== "number" || !Number.isInteger(off) || off < 0 || off > 90) {
          // Capped well below 100: a tier at 100% off is a free product, and a
          // typo that publishes one is the single most expensive thing this
          // block could do to a store.
          missing.push(`Tier ${i + 1}: a whole percentage between 0 and 90`);
        }
      });
      /*
       * A real boolean, checked before it is counted.
       *
       * The count used `=== true` while the renderer branched on truthiness,
       * so `highlight: "yes"` counted as zero here and rendered a ribbon
       * there — two "Most popular" ribbons on one panel, which is the
       * self-contradiction this rule exists to prevent.
       */
      tiers.forEach((t, i) => {
        if (isRecord(t) && t.highlight !== undefined && typeof t.highlight !== "boolean") {
          missing.push(`Tier ${i + 1}: the popular flag must be true or false`);
        }
      });
      if (tiers.filter((t) => isRecord(t) && t.highlight === true).length > 1) {
        // Two "most popular" ribbons is not a layout bug, it is a claim that
        // contradicts itself.
        missing.push("Only one tier can be the popular one");
      }
      // Allowed, but worth saying: a bigger box that costs more per unit is the
      // thing shoppers screenshot and post.
      const sorted = tiers
        .filter((t): t is { quantity: number; discountPercent: number; highlight: boolean } =>
          isRecord(t) && typeof t.quantity === "number" && typeof t.discountPercent === "number")
        .sort((a, b) => a.quantity - b.quantity);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].discountPercent < sorted[i - 1].discountPercent) {
          warnings.push(
            `Buying ${sorted[i].quantity} is discounted less than buying ${sorted[i - 1].quantity}. That's allowed, but shoppers read it as a penalty for buying more.`,
          );
          break;
        }
      }
      break;
    }

    case "low_stock": {
      const threshold = spec.threshold;
      if (
        typeof threshold !== "number" ||
        !Number.isInteger(threshold) ||
        threshold < 1 ||
        threshold > 100
      ) {
        missing.push("The stock level below which it appears (a whole number, 1–100)");
      } else if (threshold > 25) {
        // Not refused — some stores genuinely run at that scale — but "Only 80
        // left" is the version of this pattern that reads as a threat rather
        // than a status, which is the failure mode in §7.
        warnings.push(
          `At ${threshold} the message shows almost always, which shoppers learn to ignore. Under 10 is where it reads as a real status.`,
        );
      }
      break;
    }
  }

  if (missing.length > 0) return { ok: false, missing };
  // Returned unchanged, deliberately: nothing here fills anything in, and
  // handing back the caller's own object is the cheapest way to keep that true.
  return { ok: true, spec, warnings };
}
