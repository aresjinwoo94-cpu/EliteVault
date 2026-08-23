/**
 * Liquid Blocks WP-B — turn measured tokens + real product data into a block.
 *
 * # The containment rule
 * "It is impossible for this to break your theme" is a claim about SELECTORS,
 * not about care. Every rule emitted here is reachable only through
 * `.ev-blk`, and `selectorsOf` exists so that's checked mechanically
 * (scripts/tests/blocks-render.test.ts) instead of trusted to review. A block
 * that styled `img` or `.price` would restyle the merchant's own storefront the
 * moment it was pasted, and they'd find out in production.
 *
 * Custom properties are declared on the block root rather than `:root` for the
 * same reason — `:root` would leak the values into the whole document, where a
 * theme using the same variable names would visibly change.
 *
 * # The truthfulness rule
 * Nothing in the output is decorative invention. Every number comes from the
 * store's product endpoint, and an element with nothing true to say is not
 * rendered: a product with no genuine compare-at price gets no discount badge
 * at all, rather than a "SALE" flash that a generator would happily add.
 *
 * `product_facts` is the block WP-B ships, and it's deliberately the one type
 * that needs NO input from the user — it says only what Shopify already told
 * us. That's what makes it usable as the calibration proof: whatever it gets
 * wrong is a styling failure, never a content one. WP-C adds the four MVP
 * blocks, which all carry claims and therefore all require the user's own data.
 */

import type { DesignTokens } from "./design-tokens";
import type { BlocksProduct } from "./product-json";

/**
 * The single class every selector hangs off. Short, and namespaced enough that
 * no theme collides with it.
 */
export const BLOCK_PREFIX = "ev-blk";

export type BlockType = "product_facts";

export interface BlockSpec {
  type: BlockType;
}

export interface RenderedBlock {
  html: string;
  css: string;
}

/** Escape for HTML text and double-quoted attribute values. */
function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only https images are rendered. `javascript:` and `data:` are the obvious
 * ones; plain http is refused too, because a mixed-content image on an https
 * storefront is blocked by the browser and shows as a broken block.
 */
function safeImageUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function money(cents: number, currency: string | null): string {
  if (!currency) return (cents / 100).toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Extract the selectors from a stylesheet, including those nested inside
 * at-rules. Used by the containment test; exported because a check that lives
 * in the test file could drift from the CSS this module writes.
 *
 * Intentionally simple — it handles the CSS this module actually emits, and
 * anything it fails to parse shows up as a selector that doesn't start with the
 * prefix, which fails closed.
 */
export function selectorsOf(css: string): string[] {
  const out: string[] = [];
  // Strip declaration blocks' contents so `color: red` can't be read as a
  // selector, then read what precedes each `{`.
  // `@keyframes` names its steps `from`, `to` and percentages, which are not
  // selectors and would be reported as bare global elements — blocking
  // legitimate animation from WP-C onward for no reason. Dropped whole, so
  // nothing inside one is inspected either (there is nothing there to inspect:
  // keyframe steps can't target the document).
  const withoutComments = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@(-\w+-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, "");
  for (const m of withoutComments.matchAll(/([^{}]+)\{/g)) {
    // A `;` ends a statement, so only what FOLLOWS the last one is the selector
    // for this block — `@import url(x);\nbody` is an import statement and then
    // a `body` rule.
    //
    // The previous version discarded any head containing a `;` outright, which
    // made this function fail OPEN: a stylesheet could hide a global `body{}`
    // rule behind a leading @import and the containment check would report
    // nothing wrong. That's the wrong direction for a guard whose entire job is
    // to catch a selector that escapes the block, and it matters from WP-C on,
    // where this vets CSS the model wrote rather than CSS we wrote.
    const head = m[1].split(";").pop()!.trim();
    if (!head) continue;
    // `@media …` / `@supports …` introduce a nested block; their inner
    // selectors are matched by later iterations of this same loop.
    if (head.startsWith("@")) continue;
    for (const part of head.split(",")) {
      const sel = part.trim();
      if (sel) out.push(sel);
    }
  }
  return out;
}

/**
 * The stylesheet. Every declaration reads from a custom property so the values
 * appear exactly once, which is also what makes the "these are YOUR colours"
 * claim checkable by looking at the top of the block.
 */
function css(tokens: DesignTokens): string {
  const p = BLOCK_PREFIX;
  const { palette, type, shape } = tokens;
  return `
.${p}{
/* The page's own background, recorded for reference. Deliberately NOT used to
   paint anything inside the block: an inner element painted with the colour
   BEHIND the block forces one text colour to be legible on two unrelated
   backgrounds, which on a dark-surface store left the stat tiles at 1.08
   contrast. Everything nested reads --ev-inset, which is derived from the
   panel it sits on. */
--ev-bg:${palette.pageBackground};
--ev-surface:${palette.surface};
--ev-inset:${palette.inset};
--ev-text:${palette.textPrimary};
--ev-accent:${palette.accent};
--ev-accent-text:${palette.accentText};
--ev-border:${palette.border};
--ev-radius:${shape.radiusPx}px;
--ev-font:${type.bodyFamily};
--ev-font-heading:${type.headingFamily};
--ev-size:${type.baseSizePx}px;
--ev-weight-heading:${type.headingWeight};
box-sizing:border-box;
max-width:${shape.containerMaxWidthPx}px;
margin:2rem auto;
padding:1.5rem;
background:var(--ev-surface);
color:var(--ev-text);
font-family:var(--ev-font);
font-size:var(--ev-size);
line-height:1.5;
border:1px solid var(--ev-border);
border-radius:var(--ev-radius);
${shape.cardShadow ? `box-shadow:${shape.cardShadow};` : ""}
}
.${p} *{box-sizing:border-box;}
.${p}__head{display:flex;gap:1rem;align-items:flex-start;flex-wrap:wrap;}
.${p}__media{width:96px;height:96px;flex:0 0 auto;border-radius:var(--ev-radius);overflow:hidden;background:var(--ev-inset);}
.${p}__media img{width:100%;height:100%;object-fit:cover;display:block;}
.${p}__title{margin:0;font-family:var(--ev-font-heading);font-weight:var(--ev-weight-heading);font-size:1.25em;line-height:1.2;}
.${p}__vendor{margin:.25rem 0 0;opacity:.65;font-size:.875em;}
.${p}__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin-top:1.25rem;}
.${p}__stat{padding:.75rem;background:var(--ev-inset);border:1px solid var(--ev-border);border-radius:var(--ev-radius);}
.${p}__stat-label{display:block;font-size:.75em;text-transform:uppercase;letter-spacing:.06em;opacity:.6;}
.${p}__stat-value{display:block;margin-top:.25rem;font-size:1.125em;font-weight:600;}
.${p}__was{opacity:.55;text-decoration:line-through;font-weight:400;font-size:.8em;margin-left:.4em;}
.${p}__badge{display:inline-block;padding:.2em .6em;border-radius:var(--ev-radius);background:var(--ev-accent);color:var(--ev-accent-text);font-size:.8em;font-weight:600;}
@media (max-width:600px){
.${p}{padding:1rem;}
.${p}__media{width:72px;height:72px;}
}
`.trim();
}

function productFactsHtml(
  tokens: DesignTokens,
  product: BlocksProduct,
  currency: string | null,
): string {
  const p = BLOCK_PREFIX;
  const image = safeImageUrl(product.featuredImage);

  // A discount exists only when the store says so. product-json.ts has already
  // discarded stale compare-at values that aren't above the real price, so
  // reaching here means the saving is genuine.
  const discountPct =
    product.compareAtCents !== null
      ? Math.round(
          ((product.compareAtCents - product.priceCents) / product.compareAtCents) * 100,
        )
      : null;

  // Only variants that are actually in stock are counted, because "3 options"
  // when two are sold out is the kind of small lie that costs trust at the
  // exact moment the block is trying to build it.
  const inStock = product.variants.filter((v) => v.available).length;

  const stats: Array<{ label: string; value: string }> = [
    {
      label: "Price",
      value:
        money(product.priceCents, currency) +
        (product.compareAtCents !== null
          ? `<span class="${p}__was">${esc(money(product.compareAtCents, currency))}</span>`
          : ""),
    },
  ];
  if (discountPct !== null && discountPct > 0) {
    stats.push({ label: "You save", value: `${discountPct}%` });
  }
  // Only when at least one option is actually available. Rendering "0 of 13"
  // is perfectly true and actively harmful — it's a conversion block, and the
  // merchant does not need us advertising that nothing is buyable. Omitting a
  // stat isn't a lie; asserting a discouraging one nobody asked for is a choice
  // we shouldn't make on their behalf. (Seen live on a real out-of-stock PDP.)
  if (product.variants.length > 1 && inStock > 0) {
    stats.push({ label: "Options in stock", value: `${inStock} of ${product.variants.length}` });
  }
  if (product.productType) {
    stats.push({ label: "Type", value: esc(product.productType) });
  }

  return `<section class="${p}">
<div class="${p}__head">
${image ? `<div class="${p}__media"><img src="${esc(image)}" alt="${esc(product.title)}" loading="lazy"></div>` : ""}
<div>
<h3 class="${p}__title">${esc(product.title)}</h3>
${product.vendor ? `<p class="${p}__vendor">${esc(product.vendor)}</p>` : ""}
${product.available ? `<p style="margin:.5rem 0 0"><span class="${p}__badge">In stock</span></p>` : ""}
</div>
</div>
<div class="${p}__grid">
${stats
  .map(
    (s) =>
      `<div class="${p}__stat"><span class="${p}__stat-label">${esc(s.label)}</span><span class="${p}__stat-value">${s.value}</span></div>`,
  )
  .join("\n")}
</div>
</section>`;
}

export function renderBlock(input: {
  spec: BlockSpec;
  tokens: DesignTokens;
  product: BlocksProduct;
  currency: string | null;
}): RenderedBlock {
  return {
    html: productFactsHtml(input.tokens, input.product, input.currency),
    css: css(input.tokens),
  };
}
