/**
 * Liquid Blocks WP-B — the calibration layer.
 *
 * This module turns raw `getComputedStyle` strings, read off the store's own
 * product page, into the tokens that style the block. It is the reason the
 * feature exists: ChatGPT will happily hand someone a snippet in colours and
 * type it made up, and the snippet lands looking foreign on their page. We
 * measure instead.
 *
 * Two invariants, both load-bearing:
 *
 * 1. **A value we couldn't measure is never silently replaced.** Every token
 *    that didn't come from the page is named in `fallbacks`, and WP-C puts that
 *    list in front of the user as the fields to confirm. "We don't know" has to
 *    survive as far as the UI, otherwise the promise degrades into the same
 *    plausible-invention we're selling against.
 *
 * 2. **Nothing reaches CSS unless it normalizes to a known-safe shape.** These
 *    values are written into a `<style>` block, persisted, and — from WP-C —
 *    editable by the user, so by the time they're serialized they are untrusted
 *    input. Colours come out as `#rrggbb` or not at all; a font stack carrying
 *    a brace or an angle bracket is refused. A token that could escape the
 *    scoped block would break the very theme this feature promises not to touch.
 *
 * The split matters: reading the DOM happens in the browser (see
 * `TOKEN_COLLECTOR_SOURCE`), but every judgement about what the readings MEAN
 * happens here, in a pure function that can be tested without a browser.
 */

export interface DesignTokenPalette {
  pageBackground: string;
  textPrimary: string;
  /** The store's own emphasis colour — taken from the buy button. */
  accent: string;
  accentText: string;
  /** Card/section background. Often identical to pageBackground; that's fine. */
  surface: string;
  /**
   * The background for elements NESTED inside the block — stat tiles, the image
   * well. Derived from `surface`, never from `pageBackground`.
   *
   * That distinction is load-bearing. The block paints a panel in `surface` and
   * puts tiles inside it; painting those tiles with the PAGE colour means the
   * block's single text colour has to be legible on two unrelated backgrounds
   * at once. On a store where they're opposites it isn't: measured live, the
   * panel read 21:1 while the tiles inside it read 1.08 and the prices were
   * invisible.
   */
  inset: string;
  border: string;
}

export interface DesignTokenType {
  headingFamily: string;
  bodyFamily: string;
  baseSizePx: number;
  headingWeight: number;
  bodyWeight: number;
}

export interface DesignTokenShape {
  radiusPx: number;
  containerMaxWidthPx: number;
  cardShadow: string | null;
}

export interface DesignTokens {
  palette: DesignTokenPalette;
  type: DesignTokenType;
  shape: DesignTokenShape;
  /**
   * Dotted paths of tokens that are OURS, not the store's — because the page
   * didn't give us a usable value. Shown to the user as "confirm these".
   */
  fallbacks: string[];
}

/** Exactly what the in-page collector reads. All strings, all as-computed. */
export interface RawTokenSample {
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
  /**
   * False when the buy button we read was present in the DOM but not laid out
   * (a hidden quick-add template, say). Its styling is still the THEME'S, so
   * it beats inventing — but the user should be asked to confirm a colour that
   * appears nowhere on their page. Absent/undefined means "visible".
   */
  buttonWasVisible?: boolean;
}

/**
 * Last-resort values. Reaching for one of these is always recorded in
 * `fallbacks` — they exist so the block can still RENDER while the user is told
 * which parts we're guessing at, never to paper over a failed measurement.
 */
const LAST_RESORT = {
  pageBackground: "#ffffff",
  textPrimary: "#111111",
  accent: "#111111",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  baseSizePx: 16,
  containerMaxWidthPx: 1200,
  radiusPx: 8,
  weight: 400,
} as const;

/** Below this alpha, a colour isn't really being seen, so it isn't a reading. */
const MIN_USABLE_ALPHA = 0.5;

/** A pill button's radius would bow a full-width block into a lozenge. */
const MAX_USEFUL_RADIUS_PX = 32;

type Rgb = { r: number; g: number; b: number };

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Parse what getComputedStyle actually returns for a colour: `rgb(r, g, b)` or
 * `rgba(r, g, b, a)`. Deliberately narrow — modern syntaxes (`color(display-p3
 * …)`, `lab()`, gradients, `url(#…)`) return null so they're recorded as
 * unmeasured rather than half-understood.
 */
function parseColor(raw: string | null | undefined): Rgb | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "transparent" || s === "none") return null;

  const m = s.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/,
  );
  if (!m) return null;

  if (m[4] !== undefined) {
    const alpha = m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (!Number.isFinite(alpha) || alpha < MIN_USABLE_ALPHA) return null;
  }
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (![r, g, b].every(Number.isFinite)) return null;
  return { r, g, b };
}

function hexOf(raw: string | null | undefined): string | null {
  const rgb = parseColor(raw);
  return rgb ? toHex(rgb) : null;
}

function parseHex(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Perceived luminance, 0 (black) to 1 (white). WCAG's relative-luminance curve. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black/white). */
function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The minimum contrast a text/background pair must clear before we'll emit it.
 *
 * 3.0 rather than WCAG AA's 4.5 on purpose: this is a REPAIR threshold, not a
 * quality bar. Overriding a store's measured colour is itself a small betrayal
 * of "we show you your own design", so it should only happen when the result is
 * genuinely unusable — not merely when it would fail an audit.
 */
const MIN_READABLE_CONTRAST = 3.0;

/**
 * Black or white, whichever is legible on `background`. Arithmetic on a
 * measured colour, so it's a derivation rather than an invention — but callers
 * still record it, because a store whose real colour we overrode deserves to
 * be told which one.
 */
function readableOn(background: Rgb): string {
  return luminance(background) > 0.5 ? "#000000" : "#ffffff";
}

function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  };
}

/**
 * A font stack is written verbatim into our CSS, so it must be incapable of
 * ending the declaration. Computed values are already normalized by the browser,
 * but these tokens are persisted and become user-editable in WP-C — by then
 * they're untrusted input, and this is the choke point.
 *
 * Refused rather than stripped: a stack with a brace in it isn't a font name we
 * misread, it's something that has no business being here, and quietly
 * salvaging half of it would style the block with a name the store never used.
 */
const UNSAFE_IN_CSS_VALUE = /[<>{};@\\]|\/\*|\n|\r/;

/**
 * Font stacks get the stricter rule: a real font name never contains
 * parentheses, so allowing them would only ever admit something like `url(…)`
 * that has no business in a font-family.
 */
const UNSAFE_IN_FONT_STACK = /[<>{}();@\\]|\/\*|\n|\r/;

function safeFontStack(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.length > 240) return null;
  if (UNSAFE_IN_FONT_STACK.test(s)) return null;
  return s;
}

/** `border-radius: 12px 12px 0 0` → 12. The dominant corner is what a card wants. */
function parseRadiusPx(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const values = raw
    .trim()
    .split("/")[0] // ignore the elliptical form's second half
    .split(/\s+/)
    .map((v) => (v.endsWith("px") ? Number(v.slice(0, -2)) : NaN))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (values.length === 0) return null;
  // Most common value wins; ties go to the largest, which is the corner the eye
  // reads as "the" radius.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  for (const [value, count] of counts) {
    const bestCount = counts.get(best) ?? 0;
    if (count > bestCount || (count === bestCount && value > best)) best = value;
  }
  return Math.min(best, MAX_USEFUL_RADIUS_PX);
}

function parsePx(raw: string | null | undefined, min: number, max: number): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(-?[\d.]+)px$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n);
}

function parseWeight(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 100 && n <= 900 ? Math.round(n) : null;
}

/**
 * A box-shadow is passed through verbatim, so the same containment rule applies
 * as for fonts — and `none` is a real answer meaning "this store uses flat
 * cards", which must stay null rather than becoming a shadow we picked.
 */
function safeShadow(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === "none" || s.length > 240) return null;
  // Parentheses are allowed here and only here: every real shadow carries an
  // `rgba(…)`. They can't escape a declaration on their own — `;`, `{`, `}`,
  // `<`, `@`, a backslash and a comment opener are what could, and those stay
  // refused.
  if (UNSAFE_IN_CSS_VALUE.test(s)) return null;
  // Must look like a shadow: at least one length. Guards against a value that
  // is merely brace-free but meaningless.
  if (!/-?[\d.]+px/.test(s)) return null;
  return s;
}

export function normalizeDesignTokens(raw: RawTokenSample): DesignTokens {
  const fallbacks: string[] = [];
  /** Take the measurement, or record that we're supplying this one ourselves. */
  const measured = <T>(value: T | null, path: string, lastResort: T): T => {
    if (value !== null && value !== undefined) return value;
    fallbacks.push(path);
    return lastResort;
  };

  // ── Palette ──────────────────────────────────────────────────────────────
  const pageBackground = measured(
    hexOf(raw.bodyBackground),
    "palette.pageBackground",
    LAST_RESORT.pageBackground,
  );
  const measuredText = measured(
    hexOf(raw.bodyColor),
    "palette.textPrimary",
    LAST_RESORT.textPrimary,
  );

  // The accent is the buy button's fill, or — for the outlined buttons plenty of
  // themes use — its border. Both are the store's own emphasis colour, so
  // neither counts as a fallback.
  const accent = measured(
    hexOf(raw.buttonBackground) ?? hexOf(raw.buttonBorderColor),
    "palette.accent",
    LAST_RESORT.accent,
  );
  // Read off an element that exists but isn't on screen: still the theme's own
  // value, so it's used — but flagged, because `fallbacks` is the list WP-C
  // asks the user to confirm and a colour they can't see anywhere is top of it.
  if (raw.buttonWasVisible === false && !fallbacks.includes("palette.accent")) {
    fallbacks.push("palette.accent");
  }

  // Button text: measured if we read it, otherwise DERIVED for contrast against
  // the accent. Arithmetic on a measured value, not an invention — but still
  // declared, because a theme with deliberately low-contrast buttons would come
  // out looking different from the real thing.
  const measuredAccentText = hexOf(raw.buttonColor);
  // Kept only if it's actually legible ON the accent. A button measured as dark
  // grey with near-black label text is a reading we can reproduce faithfully
  // and nobody can read.
  const accentText =
    measuredAccentText !== null &&
    contrastRatio(parseHex(measuredAccentText), parseHex(accent)) >= MIN_READABLE_CONTRAST
      ? measuredAccentText
      : measured(null, "palette.accentText", readableOn(parseHex(accent)));

  /**
   * The panel colour.
   *
   * SURFACE_SELECTORS matches the first card-ish element ANYWHERE in the
   * document, which measured live on one store as #000000 on a page whose real
   * background is #f6f6f6 — a dark card from a section nowhere near the product.
   * It was technically a reading, so nothing declared it, and it dragged the
   * rest of the palette with it.
   *
   * So a measured surface has to survive one more question: can the store's own
   * measured text sit on it? If it can't and the page background can, the page
   * background is the better answer and the swap is disclosed. Repairing the
   * SURFACE first is what makes repairing the TEXT (below) a genuine last
   * resort rather than the routine outcome.
   */
  const surface = (() => {
    const chosen = measured(
      hexOf(raw.surfaceBackground),
      "palette.surface",
      pageBackground,
    );
    if (chosen === pageBackground) return chosen;
    const textOnSurface = contrastRatio(parseHex(measuredText), parseHex(chosen));
    const textOnPage = contrastRatio(parseHex(measuredText), parseHex(pageBackground));
    if (textOnSurface < MIN_READABLE_CONTRAST && textOnPage >= MIN_READABLE_CONTRAST) {
      if (!fallbacks.includes("palette.surface")) fallbacks.push("palette.surface");
      return pageBackground;
    }
    return chosen;
  })();

  /**
   * The pairing check.
   *
   * Every token above is validated in isolation, and that was not enough. Read
   * live off liquiddeath.com: `surface` came back #000000 from a dark card and
   * `bodyColor` also read as black (the store paints on a wrapper, so `body`
   * itself carries the default), and the block rendered black text on a black
   * panel. Both readings were individually valid. Their combination was
   * unusable, and nothing was looking at combinations.
   *
   * The store's own BACKGROUND wins, because that's the colour the visitor sees
   * and the one the block has to sit inside. Text is the value that gives — and
   * the override is recorded, because silently replacing a colour we did
   * measure is exactly the behaviour this module exists to prevent.
   */
  const textPrimary = (() => {
    const onSurface = contrastRatio(parseHex(measuredText), parseHex(surface));
    const onPage = contrastRatio(parseHex(measuredText), parseHex(pageBackground));
    if (onSurface >= MIN_READABLE_CONTRAST && onPage >= MIN_READABLE_CONTRAST) {
      return measuredText;
    }
    if (!fallbacks.includes("palette.textPrimary")) {
      fallbacks.push("palette.textPrimary");
    }
    return readableOn(parseHex(surface));
  })();

  // Both blended from the PANEL and its text, so they sit correctly on a white
  // store and on a near-black one alike. Deriving them from the page background
  // instead was how the border went to 1.01 against the page on a dark-surface
  // store — invisible, on the one element whose job is to draw an edge.
  const inset = toHex(mix(parseHex(surface), parseHex(textPrimary), 0.06));
  const border = toHex(mix(parseHex(surface), parseHex(textPrimary), 0.14));

  // ── Type ─────────────────────────────────────────────────────────────────
  const bodyFamily = measured(
    safeFontStack(raw.bodyFontFamily),
    "type.bodyFamily",
    LAST_RESORT.fontFamily,
  );
  // A missing heading face inherits the body stack rather than being paired with
  // a "complementary" display font — picking one would be exactly the invention
  // this module exists to prevent.
  const headingFamily = measured(
    safeFontStack(raw.headingFontFamily),
    "type.headingFamily",
    bodyFamily,
  );
  const baseSizePx = measured(
    parsePx(raw.bodyFontSize, 10, 32),
    "type.baseSizePx",
    LAST_RESORT.baseSizePx,
  );
  const bodyWeight = measured(
    parseWeight(raw.bodyFontWeight),
    "type.bodyWeight",
    LAST_RESORT.weight,
  );
  const headingWeight = measured(
    parseWeight(raw.headingFontWeight),
    "type.headingWeight",
    700,
  );

  // ── Shape ────────────────────────────────────────────────────────────────
  // 0 is a real measurement: a store with square corners must not be handed a
  // rounded block because zero looked falsy.
  const radiusPx = measured(
    parseRadiusPx(raw.buttonBorderRadius),
    "shape.radiusPx",
    LAST_RESORT.radiusPx,
  );
  const containerMaxWidthPx = measured(
    parsePx(raw.containerMaxWidth, 320, 2400),
    "shape.containerMaxWidthPx",
    LAST_RESORT.containerMaxWidthPx,
  );
  // `none` means this store uses flat cards — an answer, not a gap. A null raw
  // value means the collector found no card to read at all, which IS a gap and
  // is declared as one. Both produce no shadow; only the second is our doing.
  const cardShadow = safeShadow(raw.cardShadow);
  if (raw.cardShadow === null || raw.cardShadow === undefined) {
    fallbacks.push("shape.cardShadow");
  }

  return {
    palette: { pageBackground, textPrimary, accent, accentText, surface, inset, border },
    type: { headingFamily, bodyFamily, baseSizePx, headingWeight, bodyWeight },
    shape: { radiusPx, containerMaxWidthPx, cardShadow },
    fallbacks,
  };
}
