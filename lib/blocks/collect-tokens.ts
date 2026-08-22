/**
 * Liquid Blocks WP-B — what runs INSIDE the store's page.
 *
 * Everything in this file is serialized by puppeteer and executed in the
 * browser, so it must be self-contained: no imports, no closures over module
 * state, no helpers from elsewhere. The functions here therefore look more
 * repetitive than they otherwise would, and that's the constraint talking.
 *
 * The division of labour is deliberate. This side only READS — it returns raw
 * `getComputedStyle` strings and makes no judgements. Every decision about what
 * a reading means (is this colour usable? is that radius a pill? is this font
 * stack safe to write into CSS?) happens in lib/blocks/design-tokens.ts, which
 * is a pure function and therefore testable without a browser. Putting the
 * judgement in here would put it somewhere no unit test can reach.
 */

/**
 * How we find the buy button — in descending order of "the theme meant this
 * one". The accent colour is read from whatever matches first, and the accent
 * is the single most visible token in the finished block, so the order matters
 * more than the length of the list.
 */
export const BUY_BUTTON_SELECTORS = [
  'form[action*="/cart/add"] button[type="submit"]',
  'form[action*="/cart/add"] [type="submit"]',
  'button[name="add"]',
  ".product-form__submit",
  ".product-form__cart-submit",
  "[data-add-to-cart]",
  ".btn--add-to-cart",
  ".shopify-payment-button__button--unbranded",
  ".button--primary",
  ".btn--primary",
];

/** Where a block is inserted: after the first of these that exists. */
export const ANCHOR_SELECTORS = [
  'form[action*="/cart/add"]',
  ".product-form",
  ".product__info-wrapper",
  ".product-single__meta",
  ".product__info-container",
  "main h1",
  "h1",
];

/** Elements whose background stands in for "a card / raised surface". */
export const SURFACE_SELECTORS = [
  ".card",
  ".product-card",
  ".grid__item .card__content",
  "[class*='card__']",
  "aside",
];

/** Elements a theme uses to bound its content width. */
export const CONTAINER_SELECTORS = [
  ".page-width",
  ".container",
  ".shopify-section > .page-width",
  "main .container",
  "main",
];

/**
 * The raw readings. Mirrors RawTokenSample in design-tokens.ts — kept as a
 * separate declaration because this one has to survive being stringified into a
 * page, and importing the type across that boundary is exactly what can't
 * happen here.
 */
export interface CollectedTokens {
  bodyBackground: string | null;
  bodyColor: string | null;
  bodyFontFamily: string | null;
  bodyFontSize: string | null;
  bodyFontWeight: string | null;
  headingFontFamily: string | null;
  headingFontWeight: string | null;
  headingColor: string | null;
  headingFontSize: string | null;
  buttonBackground: string | null;
  buttonColor: string | null;
  buttonBorderRadius: string | null;
  buttonBorderColor: string | null;
  containerMaxWidth: string | null;
  cardShadow: string | null;
  surfaceBackground: string | null;
  /** Diagnostics — which selector actually matched, for the PR and for support. */
  matchedButtonSelector: string | null;
  matchedAnchorSelector: string | null;
}

/**
 * Read the page's design. Runs in the browser; see the file header for why it
 * is written the way it is.
 *
 * Note the background walk: `body` is frequently transparent on Shopify themes
 * that paint the colour on a wrapper div instead, so reading body alone would
 * report "no background" on a large share of real stores and send every one of
 * them into the fallback path. Walking up to the first ancestor with a genuine
 * colour is what makes the reading true to what a visitor sees.
 */
export function collectDesignTokens(args: {
  buttonSelectors: string[];
  surfaceSelectors: string[];
  containerSelectors: string[];
  anchorSelectors: string[];
}): CollectedTokens {
  const { buttonSelectors, surfaceSelectors, containerSelectors, anchorSelectors } = args;

  const styleOf = (el: Element | null): CSSStyleDeclaration | null =>
    el ? window.getComputedStyle(el) : null;

  const firstMatch = (
    selectors: string[],
  ): { el: Element | null; selector: string | null } => {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return { el, selector };
      } catch {
        // An invalid selector must not abort the whole collection.
      }
    }
    return { el: null, selector: null };
  };

  /** True when a computed colour is actually painting something. */
  const isPainted = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    if (v === "transparent" || v === "none") return false;
    const alpha = v.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/);
    return !(alpha && Number(alpha[1]) < 0.5);
  };

  /**
   * The nearest ancestor that actually paints a background, starting at `el`.
   * Falls back to the documentElement's own background.
   */
  const paintedBackground = (start: Element | null): string | null => {
    let el: Element | null = start;
    for (let hops = 0; el && hops < 12; hops++) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (isPainted(bg)) return bg;
      el = el.parentElement;
    }
    const rootBg = window.getComputedStyle(document.documentElement).backgroundColor;
    return isPainted(rootBg) ? rootBg : null;
  };

  const body = document.body;
  const bodyStyle = styleOf(body);

  const button = firstMatch(buttonSelectors);
  const buttonStyle = styleOf(button.el);

  const heading = document.querySelector("h1") ?? document.querySelector("h2");
  const headingStyle = styleOf(heading);

  const surface = firstMatch(surfaceSelectors);
  const container = firstMatch(containerSelectors);
  const containerStyle = styleOf(container.el);

  const anchor = firstMatch(anchorSelectors);

  // A shadow is read off a card if there is one, because that's where a theme
  // expresses elevation. `none` is a real answer and is passed through as such.
  const shadowSource = surface.el ?? button.el;
  const shadow = shadowSource ? window.getComputedStyle(shadowSource).boxShadow : null;

  return {
    bodyBackground: paintedBackground(body),
    bodyColor: bodyStyle?.color ?? null,
    bodyFontFamily: bodyStyle?.fontFamily ?? null,
    bodyFontSize: bodyStyle?.fontSize ?? null,
    bodyFontWeight: bodyStyle?.fontWeight ?? null,
    headingFontFamily: headingStyle?.fontFamily ?? null,
    headingFontWeight: headingStyle?.fontWeight ?? null,
    headingColor: headingStyle?.color ?? null,
    headingFontSize: headingStyle?.fontSize ?? null,
    buttonBackground: buttonStyle?.backgroundColor ?? null,
    buttonColor: buttonStyle?.color ?? null,
    buttonBorderRadius: buttonStyle?.borderRadius ?? null,
    buttonBorderColor: buttonStyle?.borderTopColor ?? null,
    containerMaxWidth: containerStyle?.maxWidth ?? null,
    cardShadow: shadow,
    surfaceBackground: surface.el ? paintedBackground(surface.el) : null,
    matchedButtonSelector: button.selector,
    matchedAnchorSelector: anchor.selector,
  };
}

/**
 * Insert the block after the anchor and report where it landed. Runs in the
 * browser.
 *
 * Inserted AFTER the anchor on purpose: everything above it keeps its position,
 * so a screenshot taken at the same scroll offset before and after is a genuine
 * comparison rather than two differently-shifted pages.
 */
export function injectBlock(args: {
  html: string;
  css: string;
  anchorSelectors: string[];
  styleId: string;
}): { ok: boolean; anchor: string | null } {
  const { html, css, anchorSelectors, styleId } = args;

  let anchorEl: Element | null = null;
  let anchorSelector: string | null = null;
  for (const selector of anchorSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        anchorEl = el;
        anchorSelector = selector;
        break;
      }
    } catch {
      /* invalid selector — keep looking */
    }
  }
  const target = anchorEl ?? document.querySelector("main") ?? document.body;
  if (!target) return { ok: false, anchor: null };

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);

  const holder = document.createElement("div");
  holder.setAttribute("data-ev-block", "1");
  holder.innerHTML = html;

  if (anchorEl && anchorEl.parentNode) {
    anchorEl.parentNode.insertBefore(holder, anchorEl.nextSibling);
  } else {
    target.appendChild(holder);
  }
  return { ok: true, anchor: anchorSelector };
}

/** Remove what injectBlock added, restoring the page exactly. Runs in the browser. */
export function removeBlock(styleId: string): void {
  document.getElementById(styleId)?.remove();
  document.querySelectorAll("[data-ev-block]").forEach((el) => el.remove());
}

/**
 * Scroll so the anchor sits just below the top of the viewport and report the
 * resulting offset, so the "after" shot can be taken from the identical
 * position. Runs in the browser.
 */
export function scrollToAnchor(args: {
  anchorSelectors: string[];
  offsetPx: number;
}): number {
  for (const selector of args.anchorSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - args.offsetPx;
        window.scrollTo(0, Math.max(0, top));
        return window.scrollY;
      }
    } catch {
      /* invalid selector — keep looking */
    }
  }
  return window.scrollY;
}
