import { BLOCK_CATALOG, type CatalogBlockType } from "./catalog";

/**
 * Liquid Blocks WP-C — where to paste it, written for someone who has never
 * opened a theme file.
 *
 * The brief is specific about the audience: "redactadas para alguien que NO
 * sabe editar Liquid". So no jargon that isn't immediately defined, every step
 * naming what the merchant will actually see on screen, and — the part most
 * install guides skip — how to undo it. Someone who knows they can back out in
 * ten seconds will actually try it; someone who doesn't, won't.
 *
 * Deliberately not model-generated. These steps are the same every time and a
 * model would paraphrase them differently on each export, including
 * occasionally paraphrasing them wrong, in the one document where being wrong
 * means a merchant editing the wrong file on a live store.
 */

export interface InstallGuide {
  title: string;
  /** Numbered steps, in order. Plain sentences, no markdown. */
  steps: string[];
  /** How to take it back out. */
  removal: string;
  /** Said before they start, not after they've broken something. */
  safety: string[];
}

const THEME_PATH_HINT =
  "Online Store → Themes → your live theme → the three dots (…) → Edit code";

export function installGuide(blockType: CatalogBlockType | "product_facts"): InstallGuide {
  const entry = BLOCK_CATALOG.find((b) => b.id === blockType);
  const placement =
    entry?.placement ?? "Under the price, on your product page";

  return {
    title: `Where to paste this on your product page`,
    steps: [
      "Before anything else, duplicate your theme: Online Store → Themes → the three dots (…) next to your live theme → Duplicate. This is your undo button. Work on the copy if you want to be careful, or just keep it as a backup.",
      `In your Shopify admin, go to ${THEME_PATH_HINT}.`,
      "In the file list on the left, open the Sections folder and find the file for your product page. It is usually called main-product.liquid. If you don't see it, look in Templates for product.json — open it and it will name the section it uses.",
      `Find the place in that file where you want the block. ${placement}. Search the file (Ctrl+F, or Cmd+F on a Mac) for a word you can see on your own product page — the Add to cart button's text is the easiest one to find.`,
      "Paste the whole snippet on a new line, just after the block you found. Paste all of it, including the part that starts with <style>.",
      "Click Save, then open your product page in another tab and refresh. The block should be there, in your own colours.",
    ],
    removal:
      "To remove it: go back to the same file, select everything from the {% comment %} line down to the closing </section> tag, delete it, and Save. Nothing else on the page depends on it.",
    safety: [
      "This block only ADDS to your page. It doesn't replace or modify anything that's already there.",
      "Every style in it is locked to this block, so it can't change how the rest of your theme looks.",
      "If anything looks wrong, delete the snippet and Save — your page goes back to exactly how it was.",
      "If you duplicated your theme in step 1 and something goes badly wrong, you can publish that copy and be back to normal in a few seconds.",
    ],
  };
}

/** The guide as plain text, for copying alongside the snippet. */
export function installGuideText(
  blockType: CatalogBlockType | "product_facts",
): string {
  const guide = installGuide(blockType);
  return [
    guide.title,
    "",
    ...guide.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Removing it",
    guide.removal,
    "",
    "Good to know",
    ...guide.safety.map((s) => `- ${s}`),
  ].join("\n");
}
