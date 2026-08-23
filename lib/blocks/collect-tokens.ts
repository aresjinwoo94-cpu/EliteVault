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

/**
 * Text a buy button carries when no selector matched.
 *
 * The selector list above is Dawn/Debut vocabulary, and measured against real
 * stores it missed the button on 3 of 5 — headless React storefronts and custom
 * themes share none of those class names. Each miss cost the accent colour,
 * which is the single most visible token in the finished block, so the block
 * came out in a colour the store never uses. Reading the words on the button is
 * what themes cannot rename.
 */
export const BUY_BUTTON_TEXT = /add to (cart|bag|basket)|buy it now|añadir al carrito|comprar ahora|ajouter au panier|in den warenkorb/i;

/**
 * Widgets that also say "Add to Cart" but aren't THE buy button.
 *
 * Measured on liquiddeath.com: the only text matches on the page were eight
 * 86×24 buttons belonging to a Rebuy cross-sell carousel. Reading the accent
 * off one of those measures a third-party widget's styling, not the store's —
 * and anchoring the block to one would put it in the "you may also like" rail.
 * Recommendation rails are the single most common false positive, so they're
 * excluded by container rather than by guessing at sizes.
 */
export const CROSS_SELL_CONTAINERS = [
  "[class*='rebuy']",
  "[id*='rebuy']",
  "[class*='recommend']",
  "[class*='upsell']",
  "[class*='cross-sell']",
  "[class*='also-like']",
  "[class*='related']",
  ".swiper-slide",
  "[class*='carousel']",
  "[class*='mini-cart']",
  "[class*='minicart']",
  "[class*='quick-add']",
  "[class*='quickview']",
];

/** Marks the buy button so injection can find the same element collection did. */
export const BUY_BUTTON_ATTR = "data-ev-buy-button";

/**
 * Where a block is inserted: after the first of these that exists.
 *
 * Ordered shortest-container-first, and that ordering is load-bearing. A block
 * is inserted after the anchor's ENTIRE height, so anchoring on a tall wrapper
 * like `.product__info-container` pushed the block ~1700px down the page —
 * below the fold, out of the capture, and the "after" screenshot came back
 * pixel-identical to the "before". The buy box is both the tightest anchor and
 * the right place for the block to live.
 */
export const ANCHOR_SELECTORS = [
  'form[action*="/cart/add"]',
  ".product-form",
  ".product-single__meta",
  ".product__info-wrapper",
  ".product__info-container",
  "main h1",
  "h1",
];

/**
 * Overlays that sit between the reader and the proof.
 *
 * Measured live: on two of five stores the before/after pair was dominated by a
 * newsletter modal and a cookie bar, which makes the capture useless whatever
 * the block underneath looks like. Note this is the OPPOSITE of the Analyzer's
 * stance, which deliberately keeps popups in frame because an aggressive modal
 * is itself a CRO finding — here the screenshot has one job, and it isn't
 * auditing the store.
 */
export const OVERLAY_SELECTORS = [
  "[aria-modal='true']",
  "[role='dialog']",
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  ".needsclick[class*='klaviyo']",
  "[class*='cookie-banner']",
  "[id*='cookie-banner']",
  "[class*='newsletter-popup']",
  "[id*='consent']",
  "[class*='consent-banner']",
  "[aria-label*='cookie' i]",
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
  buttonTextPattern: string;
  crossSellContainers: string[];
  surfaceSelectors: string[];
  containerSelectors: string[];
  anchorSelectors: string[];
  buyButtonAttr: string;
}): CollectedTokens {
  const { buttonSelectors, surfaceSelectors, containerSelectors, anchorSelectors } = args;
  // A RegExp can't cross the page boundary, so it arrives as its source string.
  const buttonText = new RegExp(args.buttonTextPattern, "i");

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

  /** The nearest ancestor of `el` that actually paints a background. */
  const paintedAncestor = (start: Element | null): string | null => {
    let el: Element | null = start;
    for (let hops = 0; el && hops < 20; hops++) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (isPainted(bg)) return bg;
      el = el.parentElement;
    }
    return null;
  };

  /**
   * The background the visitor actually sees.
   *
   * Reading `body` alone is wrong on a large share of Shopify themes, which
   * leave body transparent and paint the colour on a wrapper div inside it —
   * and a wrapper is a DESCENDANT of body, so walking up from body can only
   * ever reach `<html>`. Measured live on a black storefront: the upward walk
   * reported "no background" and the block came out white on a black page.
   *
   * Sampling with elementFromPoint gets there from the other direction: it
   * returns the deepest element painted at a coordinate, so walking UP from
   * THAT lands on the wrapper. Points are taken at the left and right margins,
   * below the header band, where page background is most likely to be exposed
   * rather than covered by content.
   */
  const visibleBackground = (): string | null => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const points: Array<[number, number]> = [
      [6, Math.round(h * 0.5)],
      [w - 6, Math.round(h * 0.5)],
      [6, Math.round(h * 0.8)],
      [w - 6, Math.round(h * 0.8)],
      [Math.round(w * 0.5), Math.round(h * 0.92)],
    ];
    const counts: Record<string, number> = {};
    let best: string | null = null;
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      const bg = paintedAncestor(hit);
      if (!bg) continue;
      counts[bg] = (counts[bg] ?? 0) + 1;
      if (best === null || counts[bg] > counts[best]) best = bg;
    }
    if (best) return best;
    // Nothing sampled cleanly — fall back to the document's own colours.
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (isPainted(bodyBg)) return bodyBg;
    const rootBg = window.getComputedStyle(document.documentElement).backgroundColor;
    return isPainted(rootBg) ? rootBg : null;
  };

  /**
   * The buy button — by selector first, then by the words on it.
   *
   * The text pass is what rescues headless and custom storefronts, where none
   * of the theme class names exist. Candidates must be big enough to be a real
   * button (a 12px "add to cart" in a hidden mini-cart template is not the one
   * the visitor clicks) and the largest match wins.
   */
  const inCrossSell = (el: Element): boolean => {
    for (const selector of args.crossSellContainers) {
      try {
        if (el.closest(selector)) return true;
      } catch {
        /* invalid selector — keep checking the rest */
      }
    }
    return false;
  };

  const laidOut = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    return r.width >= 40 && r.height >= 20;
  };

  /**
   * Every clickable on the page, INCLUDING inside shadow roots.
   *
   * `querySelectorAll` does not pierce a shadow boundary, and modern headless
   * storefronts build their buy button as a web component. On those stores the
   * only "Add to Cart" a flat query could see belonged to a cross-sell widget
   * or a hidden template — which is how the accent ended up invented on pages
   * that were displaying a perfectly readable button the whole time.
   */
  const deepClickables = (): Element[] => {
    const out: Element[] = [];
    const visit = (root: Document | ShadowRoot, depth: number) => {
      if (depth > 6) return;
      root
        .querySelectorAll("button, a, input[type='submit'], [role='button']")
        .forEach((el) => out.push(el));
      root.querySelectorAll("*").forEach((el) => {
        const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
        if (shadow) visit(shadow, depth + 1);
      });
    };
    visit(document, 0);
    return out;
  };

  /**
   * Find the buy button, in descending order of how much we trust the answer.
   *
   * The ordering came out of measurement, not taste. On one store the themed
   * selector matched a 0×0 element — a hidden quick-add template — and the
   * collector happily read its styles while the button the shopper actually
   * sees went unexamined. On two others no selector matched anything and the
   * accent was invented outright.
   *
   *   1. a themed selector on an element that is actually laid out
   *   2. the words on a visible button (rescues headless/custom storefronts)
   *   3. a themed selector on a hidden element — worth strictly more than
   *      giving up, because a hidden `.product-form__submit` still carries the
   *      THEME'S button styling. That's a real measurement of the store's
   *      design, just not of something on screen.
   *
   * Only when all three miss do we fall back, and then design-tokens.ts records
   * the accent as ours rather than theirs.
   */
  const findBuyButton = (): { el: Element | null; selector: string | null } => {
    for (const selector of buttonSelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && laidOut(el) && !inCrossSell(el)) return { el, selector };
      } catch {
        /* invalid selector — keep looking */
      }
    }

    let best: Element | null = null;
    let bestArea = 0;
    for (const el of deepClickables()) {
      const label = (
        el.textContent ||
        el.getAttribute("value") ||
        el.getAttribute("aria-label") ||
        ""
      ).trim();
      if (!label || label.length > 60 || !buttonText.test(label)) continue;
      // A recommendation rail's "Add to Cart" is a different product's button.
      if (inCrossSell(el) || !laidOut(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > bestArea) {
        best = el;
        bestArea = r.width * r.height;
      }
    }
    if (best) return { el: best, selector: "text:buy-button" };

    const hidden = firstMatch(buttonSelectors);
    if (hidden.el && !inCrossSell(hidden.el)) {
      return { el: hidden.el, selector: `${hidden.selector} (not laid out)` };
    }
    return { el: null, selector: null };
  };

  const body = document.body;
  const bodyStyle = styleOf(body);

  const button = findBuyButton();
  const buttonStyle = styleOf(button.el);
  // Tag it so injection anchors on the SAME element this measured, instead of
  // re-deriving it with a second copy of this logic that can disagree. Cleared
  // again by removeBlock.
  if (button.el) button.el.setAttribute(args.buyButtonAttr, "1");

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
    bodyBackground: visibleBackground(),
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
    surfaceBackground: surface.el ? paintedAncestor(surface.el) : null,
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
  buyButtonAttr: string;
  styleId: string;
}): { ok: boolean; anchor: string | null; blockTop: number; blockHeight: number } {
  const { html, css, anchorSelectors, styleId } = args;

  let anchorEl: Element | null = null;
  let anchorSelector: string | null = null;

  /**
   * The buy button the collector already found and tagged comes FIRST.
   *
   * Ordering this after the themed selectors was a measured mistake: on a store
   * whose only match was `.product__info-container`, the block went in after a
   * 1705px-tall wrapper — a third of the way down the page, nowhere near the
   * buy box. The button is both the tightest anchor available and the place the
   * block is supposed to live.
   */
  const tagged = document.querySelector(`[${args.buyButtonAttr}]`);
  if (tagged) {
    // The button's form (or its parent) keeps the block outside the button's
    // own layout rather than wedged between a button and its label.
    anchorEl = tagged.closest("form") ?? tagged.parentElement;
    anchorSelector = "buy-button";
  }

  if (!anchorEl) {
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
  }

  const target = anchorEl ?? document.querySelector("main") ?? document.body;
  if (!target) return { ok: false, anchor: null, blockTop: 0, blockHeight: 0 };

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);

  const holder = document.createElement("div");
  holder.setAttribute("data-ev-block", "1");
  // The holder must not inherit a flex/grid parent's sizing, or it collapses.
  holder.style.setProperty("display", "block", "important");
  holder.style.setProperty("width", "100%", "important");
  holder.innerHTML = html;

  if (anchorEl && anchorEl.parentNode) {
    anchorEl.parentNode.insertBefore(holder, anchorEl.nextSibling);
  } else {
    target.appendChild(holder);
  }

  /**
   * Rescue a collapsed injection.
   *
   * Measured on a headless storefront whose only anchor was an `h1` with zero
   * height: the block landed inside a zero-size container and rendered 0px
   * tall, so the "after" screenshot showed nothing at all. Zero height means
   * the parent is hiding it — clipping, collapsing, or display:none — and no
   * amount of styling the block itself fixes that. Re-home it somewhere it can
   * actually lay out, and prefer being in the wrong PLACE over being invisible.
   */
  let rect = holder.getBoundingClientRect();
  if (rect.height < 1) {
    const fallbackHome = document.querySelector("main") ?? document.body;
    fallbackHome.appendChild(holder);
    anchorSelector = (anchorSelector ?? "none") + " → reparented (collapsed)";
    rect = holder.getBoundingClientRect();
  }

  return {
    ok: rect.height >= 1,
    anchor: anchorSelector,
    blockTop: Math.round(rect.top + window.scrollY),
    blockHeight: Math.round(rect.height),
  };
}

/**
 * Get modals and cookie bars out of the way. Runs in the browser.
 *
 * Best-effort and deliberately blunt: Escape first (which dismisses most
 * well-built dialogs properly), then hide what's left by known selector or by
 * shape — position:fixed and covering a quarter of the viewport is a modal, not
 * a sticky header. Returns how many it hid, for the log.
 */
export function dismissOverlays(overlaySelectors: string[]): number {
  let hidden = 0;
  const hide = (el: Element) => {
    (el as HTMLElement).style.setProperty("display", "none", "important");
    hidden++;
  };

  for (const selector of overlaySelectors) {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.closest("[data-ev-block]")) hide(el);
      });
    } catch {
      /* invalid selector — keep going */
    }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  document.querySelectorAll("body *").forEach((el) => {
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" || style.display === "none") return;
    if (el.closest("[data-ev-block]")) return;
    const r = el.getBoundingClientRect();

    // A quarter of the screen is the line between "banner" and "in the way".
    const isModal = r.width * r.height >= vw * vh * 0.25;

    // Consent bars are the common case this missed: a wide strip pinned to the
    // bottom is only a few hundred pixels tall, so it never reached the area
    // threshold and sat in the middle of the proof shot. A sticky HEADER is
    // also wide and short, so the test is specifically bottom-anchored.
    const isBottomBar =
      r.width >= vw * 0.6 && r.bottom >= vh - 8 && r.height >= 40 && r.top > vh * 0.5;

    if (isModal || isBottomBar) hide(el);
  });

  return hidden;
}

/**
 * Remove what injectBlock added, restoring the page exactly. Runs in the
 * browser. The buy-button tag is left in place deliberately — the block is
 * injected and removed more than once per session, and re-finding the same
 * button each time is the point of tagging it.
 */
export function removeBlock(styleId: string): void {
  document.getElementById(styleId)?.remove();
  document.querySelectorAll("[data-ev-block]").forEach((el) => el.remove());
}

/**
 * Wait for the page to be worth measuring. Runs in the browser, polled by the
 * caller via waitForFunction.
 *
 * Measured across five real storefronts: on the JS-heavy ones, everything that
 * matters — the buy button, the price, the product form — had zero size a
 * couple of seconds after DOMContentLoaded, so calibration read a page that
 * hadn't been laid out yet and reported "nothing found" for the single most
 * important token. A fixed sleep either wastes time on fast stores or is too
 * short for slow ones; this asks the actual question.
 */
export function productPageIsReady(args: {
  buttonSelectors: string[];
  buttonTextPattern: string;
  crossSellContainers: string[];
}): boolean {
  const buttonText = new RegExp(args.buttonTextPattern, "i");
  const inCrossSell = (el: Element): boolean => {
    for (const selector of args.crossSellContainers) {
      try {
        if (el.closest(selector)) return true;
      } catch {
        /* invalid selector */
      }
    }
    return false;
  };
  const laidOut = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    return r.width >= 40 && r.height >= 20;
  };

  for (const selector of args.buttonSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el && laidOut(el) && !inCrossSell(el)) return true;
    } catch {
      /* invalid selector */
    }
  }
  // Shadow roots included — a web-component buy button is invisible to a flat
  // querySelectorAll, and waiting for one that can never be seen just burns the
  // whole timeout on every run.
  const clickables: Element[] = [];
  const visit = (root: Document | ShadowRoot, depth: number) => {
    if (depth > 6) return;
    root
      .querySelectorAll("button, a, input[type='submit'], [role='button']")
      .forEach((el) => clickables.push(el));
    root.querySelectorAll("*").forEach((el) => {
      const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (shadow) visit(shadow, depth + 1);
    });
  };
  visit(document, 0);

  for (const el of clickables) {
    const label = (
      el.textContent ||
      el.getAttribute("value") ||
      el.getAttribute("aria-label") ||
      ""
    ).trim();
    if (!label || label.length > 60 || !buttonText.test(label)) continue;
    if (inCrossSell(el) || !laidOut(el)) continue;
    return true;
  }
  return false;
}

/**
 * Scroll to an absolute document position, leaving `offsetPx` of the page above
 * it, and report where we actually ended up. Runs in the browser.
 *
 * Takes a coordinate rather than a selector because the caller frames on the
 * BLOCK, whose position it learns by injecting once and measuring. Framing on
 * the anchor instead is what put the block off-screen on three of five real
 * stores: a block goes in after the anchor's entire height, so a tall anchor
 * pushes it far below whatever the anchor's own top suggested.
 *
 * The returned value is the scroll the page settled at — near the document
 * bottom the browser clamps, and both shots must use the same number.
 */
export function scrollToPosition(args: { top: number; offsetPx: number }): number {
  window.scrollTo(0, Math.max(0, args.top - args.offsetPx));
  return window.scrollY;
}

/**
 * Put the injected block in the middle of the viewport and report how much of
 * it is visible. Runs in the browser.
 *
 * Scrolling to a remembered coordinate isn't enough on its own: near the foot
 * of a document the browser clamps the scroll, and the block ends up lower in
 * the frame than the arithmetic predicted — measured live, a 269px block came
 * out 150px cut off. Asking the element to centre itself is the correction that
 * survives clamping, lazy images, and sticky headers.
 */
export function frameBlock(): { scrollY: number; visiblePx: number; height: number } {
  const el = document.querySelector(".ev-blk");
  if (!el) return { scrollY: window.scrollY, visiblePx: 0, height: 0 };

  // Defeat the theme's `scroll-behavior: smooth` before scrolling. With it on,
  // the scroll ANIMATES, and the measurement taken on the next line reads the
  // position the page is moving away from — which is why a 269px block kept
  // reporting 150px visible no matter how the framing was reordered. The
  // `behavior: "instant"` option is not enough on its own here.
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";

  const rect = el.getBoundingClientRect();
  const centred =
    rect.top + window.scrollY - Math.max(0, (window.innerHeight - rect.height) / 2);
  window.scrollTo(0, Math.max(0, centred));
  root.style.scrollBehavior = previous;

  const r = el.getBoundingClientRect();
  const visible =
    Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top);
  return {
    scrollY: window.scrollY,
    visiblePx: Math.max(0, Math.round(visible)),
    height: Math.round(r.height),
  };
}
