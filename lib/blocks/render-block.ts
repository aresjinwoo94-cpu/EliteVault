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
import type { BlockSpecInput } from "./catalog";

/**
 * The single class every selector hangs off. Short, and namespaced enough that
 * no theme collides with it.
 */
export const BLOCK_PREFIX = "ev-blk";

/**
 * `product_facts` is WP-B's calibration block — the only one that carries no
 * claims, because it says nothing the store's own product endpoint didn't tell
 * us. The other four are WP-C's catalogue and every one of them requires the
 * merchant's own data (see lib/blocks/catalog.ts).
 */
export type BlockSpec = BlockSpecInput | { type: "product_facts" };

/** Preview substitutes real values; liquid substitutes Liquid expressions. */
export type RenderMode = "preview" | "liquid";

export interface RenderedBlock {
  html: string;
  css: string;
  /** Present only in liquid mode: the self-contained snippet to paste. */
  liquid?: string;
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
.${p}__lede{margin:0 0 1rem;font-family:var(--ev-font-heading);font-weight:var(--ev-weight-heading);font-size:1.15em;line-height:1.3;}
.${p}__trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;}
.${p}__trust-item{display:flex;gap:.65rem;align-items:flex-start;}
.${p}__icon{width:1.5em;height:1.5em;flex:0 0 auto;color:var(--ev-accent);}
.${p}__icon svg{width:100%;height:100%;display:block;}
.${p}__trust-label{display:block;font-weight:600;font-size:.95em;}
.${p}__trust-detail{display:block;margin-top:.15rem;opacity:.65;font-size:.85em;}
.${p}__logo{max-height:40px;width:auto;display:block;margin-bottom:1rem;}
.${p}__benefits{list-style:none;margin:0;padding:0;display:grid;gap:.6rem;}
.${p}__benefit{display:flex;gap:.6rem;align-items:flex-start;}
.${p}__tick{color:var(--ev-accent);flex:0 0 auto;font-weight:700;}
.${p}__table{width:100%;border-collapse:collapse;font-size:.95em;}
.${p}__table th,.${p}__table td{padding:.6rem .75rem;text-align:left;border-bottom:1px solid var(--ev-border);}
.${p}__table th{font-size:.75em;text-transform:uppercase;letter-spacing:.06em;opacity:.6;font-weight:600;}
.${p}__ours{font-weight:600;}
.${p}__row-win .${p}__ours{color:var(--ev-accent);}
.${p}__bar{height:.5rem;margin-top:.4rem;border-radius:var(--ev-radius);background:var(--ev-border);overflow:hidden;}
.${p}__bar-fill{display:block;height:100%;background:var(--ev-accent);}
.${p}__unit{font-size:.7em;opacity:.7;margin-left:.15em;}
@media (max-width:600px){
.${p}{padding:1rem;}
.${p}__media{width:72px;height:72px;}
.${p}__table th,.${p}__table td{padding:.5rem .4rem;}
}
`.trim();
}

/**
 * Inline icons for the trust block.
 *
 * Inline, not a font or a sprite, because a block that fetches anything is a
 * block that can break later and a request the merchant never agreed to — the
 * validator rejects external URLs for exactly that reason, and our own template
 * has to pass the same gate. `currentColor` is what lets them take the store's
 * accent without a second token.
 */
const ICON_PATHS: Record<string, string> = {
  shipping: "M3 7h11v8H3zM14 10h3.5L21 13v2h-7zM6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  returns: "M4 9h11a4 4 0 0 1 0 8h-5M4 9l3-3M4 9l3 3",
  warranty: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z",
  "secure-payment": "M5 11h14v8H5zM8 11V8a4 4 0 0 1 8 0v3",
  support: "M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 3 3h1v-6H7v-1a5 5 0 0 1 10 0v1h-2v6h1a3 3 0 0 0 3-3v-4a7 7 0 0 0-7-7z",
  sustainable: "M12 21c5-2 8-6 8-11V5l-8-2-8 2v5c0 5 3 9 8 11z",
};

function icon(name: string): string {
  const path = ICON_PATHS[name] ?? ICON_PATHS.shipping;
  return `<span class="${BLOCK_PREFIX}__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></span>`;
}

function productFactsHtml(
  tokens: DesignTokens,
  product: BlocksProduct,
  currency: string | null,
  mode: RenderMode,
  fields: ReturnType<typeof productFields>,
): string {
  const p = BLOCK_PREFIX;
  const image = safeImageUrl(product.featuredImage);

  /**
   * The Liquid form of the same panel.
   *
   * Written out separately rather than string-substituted into the preview,
   * because the two genuinely differ in KIND, not just in values: a discount
   * percentage is arithmetic we can do here but the theme has to do at render
   * time, and "is there a discount at all" becomes a condition rather than an
   * `if` in TypeScript. Baking today's answer into a snippet that lives in a
   * theme for a year is how a block ends up announcing a sale that ended in
   * March.
   */
  if (mode === "liquid") {
    return `<section class="${p}">
<div class="${p}__head">
{%- if product.featured_image %}
<div class="${p}__media"><img src="{{ product.featured_image | image_url: width: 200 }}" alt="{{ product.title | escape }}" loading="lazy"></div>
{%- endif %}
<div>
<h3 class="${p}__title">{{ product.title }}</h3>
{%- if product.vendor != blank %}
<p class="${p}__vendor">{{ product.vendor }}</p>
{%- endif %}
{%- if product.available %}
<p style="margin:.5rem 0 0"><span class="${p}__badge">In stock</span></p>
{%- endif %}
</div>
</div>
<div class="${p}__grid">
<div class="${p}__stat"><span class="${p}__stat-label">Price</span><span class="${p}__stat-value">{{ product.price | money }}{%- if product.compare_at_price > product.price %}<span class="${p}__was">{{ product.compare_at_price | money }}</span>{%- endif %}</span></div>
{%- if product.compare_at_price > product.price %}
<div class="${p}__stat"><span class="${p}__stat-label">You save</span><span class="${p}__stat-value">{{ product.compare_at_price | minus: product.price | times: 100 | divided_by: product.compare_at_price }}%</span></div>
{%- endif %}
{%- if product.type != blank %}
<div class="${p}__stat"><span class="${p}__stat-label">Type</span><span class="${p}__stat-value">{{ product.type }}</span></div>
{%- endif %}
</div>
</section>`;
  }

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

/**
 * The product's fields, as either real values or Liquid expressions.
 *
 * This is what lets one renderer produce both the preview and the export. The
 * preview is the promise ("this is how it will look") and the Liquid is what's
 * delivered against it — generating them from separate code paths means they
 * can disagree, and the place a disagreement surfaces is the merchant's live
 * storefront, after they've paid.
 *
 * Liquid mode reads from the product object rather than baking values in, so a
 * snippet that lives in a theme indefinitely stays correct when the merchant
 * renames the product or runs a sale. The money filter matters for the same
 * reason: `{{ product.price }}` renders `8900`, and only the filter turns that
 * into $89.00 in the shopper's own currency.
 */
function productFields(
  product: BlocksProduct,
  currency: string | null,
  mode: RenderMode,
) {
  if (mode === "liquid") {
    return {
      title: "{{ product.title }}",
      vendor: "{{ product.vendor }}",
      price: "{{ product.price | money }}",
      compareAt: "{{ product.compare_at_price | money }}",
      image: "{{ product.featured_image | image_url: width: 200 }}",
    };
  }
  return {
    title: esc(product.title),
    vendor: esc(product.vendor ?? ""),
    price: esc(money(product.priceCents, currency)),
    compareAt:
      product.compareAtCents !== null
        ? esc(money(product.compareAtCents, currency))
        : "",
    image: esc(safeImageUrl(product.featuredImage) ?? ""),
  };
}

function trustHtml(spec: Extract<BlockSpecInput, { type: "trust_icons" }>): string {
  const p = BLOCK_PREFIX;
  const items = spec.items
    .map(
      (item) =>
        `<div class="${p}__trust-item">${icon(item.icon)}<span><span class="${p}__trust-label">${esc(item.label)}</span>${
          item.detail.trim()
            ? `<span class="${p}__trust-detail">${esc(item.detail)}</span>`
            : ""
        }</span></div>`,
    )
    .join("\n");
  return `<section class="${p}">
<div class="${p}__trust">
${items}
</div>
</section>`;
}

function brandHtml(
  spec: Extract<BlockSpecInput, { type: "brand_cards" }>,
): string {
  const p = BLOCK_PREFIX;
  const logo = safeImageUrl(spec.logoUrl);
  const benefits = spec.benefits
    .filter((b) => b.trim())
    .map(
      (b) =>
        `<li class="${p}__benefit"><span class="${p}__tick" aria-hidden="true">✓</span><span>${esc(b)}</span></li>`,
    )
    .join("\n");
  return `<section class="${p}">
${logo ? `<img class="${p}__logo" src="${esc(logo)}" alt="" loading="lazy">` : ""}
<p class="${p}__lede">${esc(spec.promise)}</p>
<ul class="${p}__benefits">
${benefits}
</ul>
</section>`;
}

function comparisonHtml(
  spec: Extract<BlockSpecInput, { type: "comparison" }>,
  fields: ReturnType<typeof productFields>,
): string {
  const p = BLOCK_PREFIX;
  const rows = spec.rows
    .map(
      (row) =>
        `<tr class="${row.weWin ? `${p}__row-win` : ""}"${row.weWin ? ` data-ev-win="true"` : ""}><td>${esc(row.label)}</td><td class="${p}__ours">${esc(row.ours)}</td><td>${esc(row.theirs)}</td></tr>`,
    )
    .join("\n");
  return `<section class="${p}">
<table class="${p}__table">
<thead><tr><th></th><th>${fields.title}</th><th>${esc(spec.competitorName)}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
}

function statsHtml(
  spec: Extract<BlockSpecInput, { type: "product_stats" }>,
  fields: ReturnType<typeof productFields>,
): string {
  const p = BLOCK_PREFIX;
  // The bars are scaled against the largest figure in the set, so they compare
  // the merchant's own numbers to each other and never imply a benchmark we
  // don't have.
  const values = spec.stats.map((s) => Math.abs(Number(s.value)) || 0);
  const peak = Math.max(...values, 1);
  const tiles = spec.stats
    .map((stat, i) => {
      const pct = Math.max(2, Math.round((values[i] / peak) * 100));
      return `<div class="${p}__stat"><span class="${p}__stat-label">${esc(stat.label)}</span><span class="${p}__stat-value">${esc(stat.value)}${
        stat.unit.trim() ? `<span class="${p}__unit">${esc(stat.unit)}</span>` : ""
      }</span><span class="${p}__bar"><span class="${p}__bar-fill" style="width:${pct}%"></span></span></div>`;
    })
    .join("\n");
  return `<section class="${p}">
<p class="${p}__lede">${fields.title}</p>
<div class="${p}__grid">
${tiles}
</div>
</section>`;
}

export function renderBlock(input: {
  spec: BlockSpec;
  tokens: DesignTokens;
  product: BlocksProduct;
  currency: string | null;
  /** Defaults to the preview. See productFields for why both come from here. */
  mode?: RenderMode;
}): RenderedBlock {
  const mode: RenderMode = input.mode ?? "preview";
  const fields = productFields(input.product, input.currency, mode);
  const stylesheet = css(input.tokens);

  let body: string;
  switch (input.spec.type) {
    case "trust_icons":
      body = trustHtml(input.spec);
      break;
    case "brand_cards":
      body = brandHtml(input.spec);
      break;
    case "comparison":
      body = comparisonHtml(input.spec, fields);
      break;
    case "product_stats":
      body = statsHtml(input.spec, fields);
      break;
    default:
      body = productFactsHtml(
        input.tokens,
        input.product,
        input.currency,
        mode,
        fields,
      );
  }

  return {
    html: body,
    css: stylesheet,
    // The exported form is the same markup with its own stylesheet inlined, so
    // what the merchant pastes is self-contained and identical to what they
    // approved in the preview.
    liquid:
      mode === "liquid"
        ? `{% comment %}
  Liquid Blocks by EliteVault — additive block, safe to remove.
  Every style below is scoped to .${BLOCK_PREFIX}; nothing here touches your theme.
{% endcomment %}
<style>
${stylesheet}
</style>
${body}`
        : undefined,
  };
}
