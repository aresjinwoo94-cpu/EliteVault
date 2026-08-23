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

export interface ProductStatInput {
  label: string;
  /** Digits. Prose belongs in a claims block, not a stats one. */
  value: string;
  unit: string;
}

export type BlockSpecInput =
  | { type: "trust_icons"; items: TrustItemInput[] }
  | {
      type: "brand_cards";
      promise: string;
      benefits: string[];
      logoUrl: string | null;
    }
  | { type: "comparison"; competitorName: string; rows: ComparisonRowInput[] }
  | { type: "product_stats"; stats: ProductStatInput[] };

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
}

export const BLOCK_CATALOG: CatalogEntry[] = [
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
  },
  {
    id: "brand_cards",
    name: "Brand cards",
    summary: "Who you are and why this product is worth it, in three or four lines.",
    requires: [
      "Your promise in one sentence",
      "Three or four concrete benefits",
      "Your logo (optional)",
    ],
    placement: "Under the product description",
  },
  {
    id: "comparison",
    name: "Comparison table",
    summary: "This product against the alternative your buyer is actually considering.",
    requires: [
      "The competitor, by name",
      "The rows to compare (price, materials, delivery…)",
      "Your value and theirs for each row",
    ],
    placement: "Under the product description",
  },
  {
    id: "product_stats",
    name: "Product stats",
    summary: "Real numbers about this product — the ones you can back up.",
    requires: ["At least one real figure, with a label"],
    placement: "Under the price, or under the description",
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
  cellValue: 40,
  statLabel: 40,
  statValue: 12,
  unit: 8,
} as const;

const MAX_ITEMS = { trust: 6, benefits: 6, rows: 8, stats: 6 } as const;

function filled(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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
  const tooLong = (what: string, value: string, cap: number) => {
    if (value.trim().length > cap) missing.push(`${what} is too long (max ${cap} characters)`);
  };

  switch (spec.type) {
    case "trust_icons": {
      if (!Array.isArray(spec.items) || spec.items.length === 0) {
        missing.push("At least one trust item — we don't invent these");
        break;
      }
      if (spec.items.length > MAX_ITEMS.trust) {
        missing.push(`Too many trust items (max ${MAX_ITEMS.trust})`);
      }
      spec.items.forEach((item, i) => {
        // The label IS the claim, so it's the one required part. The detail
        // line only elaborates, and plenty of merchants have nothing to add.
        if (!filled(item.label)) missing.push(`Trust item ${i + 1}: what does it say?`);
        else tooLong(`Trust item ${i + 1}`, item.label, MAX.label);
        if (filled(item.detail)) tooLong(`Trust item ${i + 1} detail`, item.detail, MAX.detail);
      });
      break;
    }

    case "brand_cards": {
      if (!filled(spec.promise)) missing.push("Your promise, in one sentence");
      else tooLong("The promise", spec.promise, MAX.promise);

      const benefits = Array.isArray(spec.benefits) ? spec.benefits.filter(filled) : [];
      if (benefits.length < 3) {
        missing.push("At least three benefits (a card with one line looks unfinished)");
      }
      if (benefits.length > MAX_ITEMS.benefits) {
        missing.push(`Too many benefits (max ${MAX_ITEMS.benefits})`);
      }
      benefits.forEach((b, i) => tooLong(`Benefit ${i + 1}`, b, MAX.benefit));

      if (!httpsOrNull(spec.logoUrl)) {
        missing.push("The logo must be an https:// image URL");
      }
      break;
    }

    case "comparison": {
      if (!filled(spec.competitorName)) {
        // A comparison is a claim ABOUT SOMEONE. It needs a subject the
        // merchant chose deliberately — that's both honest and their legal
        // exposure, not ours to guess at.
        missing.push("Competitor: what you're comparing against, by name");
      } else tooLong("The competitor name", spec.competitorName, MAX.competitor);

      const rows = Array.isArray(spec.rows) ? spec.rows : [];
      if (rows.length === 0) missing.push("At least one row to compare");
      if (rows.length > MAX_ITEMS.rows) missing.push(`Too many rows (max ${MAX_ITEMS.rows})`);
      rows.forEach((row, i) => {
        if (!filled(row.label)) missing.push(`Row ${i + 1}: what are you comparing?`);
        if (!filled(row.ours)) missing.push(`Row ${i + 1}: your value`);
        if (!filled(row.theirs)) missing.push(`Row ${i + 1}: their value`);
        tooLong(`Row ${i + 1} label`, row.label ?? "", MAX.statLabel);
        tooLong(`Row ${i + 1} (yours)`, row.ours ?? "", MAX.cellValue);
        tooLong(`Row ${i + 1} (theirs)`, row.theirs ?? "", MAX.cellValue);
      });

      // Allowed — it might be true — but a table the competitor loses outright
      // reads as marketing rather than comparison, and a shopper discounts the
      // whole thing. Better said now than discovered from the conversion rate.
      if (rows.length >= 3 && rows.every((r) => r.weWin)) {
        warnings.push(
          "You win every row. A comparison where the alternative never wins reads as an ad — conceding one honest point usually makes the rest more believable.",
        );
      }
      break;
    }

    case "product_stats": {
      const stats = Array.isArray(spec.stats) ? spec.stats : [];
      if (stats.length === 0) {
        // The block the brief singles out: no numbers, no block. It is not
        // offered rather than filled with plausible-looking figures.
        missing.push("At least one real number — without figures this block isn't offered");
        break;
      }
      if (stats.length > MAX_ITEMS.stats) missing.push(`Too many stats (max ${MAX_ITEMS.stats})`);
      stats.forEach((stat, i) => {
        if (!filled(stat.label)) missing.push(`Stat ${i + 1}: what does the number measure?`);
        else tooLong(`Stat ${i + 1} label`, stat.label, MAX.statLabel);
        if (!filled(stat.value) || !isNumeric(stat.value)) {
          // "Loved by everyone" is not a statistic. Letting prose in turns a
          // chart into a claims block wearing a chart's clothes.
          missing.push(`Stat ${i + 1}: a number (prose belongs in Brand cards)`);
        } else tooLong(`Stat ${i + 1} value`, stat.value, MAX.statValue);
        if (filled(stat.unit)) tooLong(`Stat ${i + 1} unit`, stat.unit, MAX.unit);
      });
      break;
    }
  }

  if (missing.length > 0) return { ok: false, missing };
  // Returned unchanged, deliberately: nothing here fills anything in, and
  // handing back the caller's own object is the cheapest way to keep that true.
  return { ok: true, spec, warnings };
}
