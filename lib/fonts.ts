import localFont from "next/font/local";

/**
 * Self-hosted, bundled font — the WHOLE UI is now **Rubik**, everywhere.
 *
 * The file lives in `public/fonts/rubik.woff2` (a variable face, weights
 * 300–700) and is loaded via `next/font/local`, so the build needs NO network
 * and renders identically on every machine.
 *
 * The THREE legacy CSS variables (`--font-serif`, `--font-geist`, `--font-mono`)
 * are ALL backed by the same Rubik file. This means every existing className —
 * `font-serif`, `font-sans`, `font-mono`, `.text-display`, `.text-h1/h2`,
 * `.num`, `.article-prose`, `.legal-prose` — renders in Rubik with NO refactor,
 * and it is impossible for a stray serif (Fraunces) or Geist to slip through.
 */
const fontSerif = localFont({
  src: "../public/fonts/rubik.woff2",
  variable: "--font-serif",
  display: "swap",
  weight: "300 700",
  fallback: ["Inter", "Segoe UI Variable", "system-ui", "sans-serif"],
});

const fontSans = localFont({
  src: "../public/fonts/rubik.woff2",
  variable: "--font-geist",
  display: "swap",
  weight: "300 700",
  fallback: ["Inter", "Segoe UI Variable", "system-ui", "sans-serif"],
});

const fontMono = localFont({
  src: "../public/fonts/rubik.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "300 700",
  fallback: ["Inter", "Segoe UI Variable", "system-ui", "sans-serif"],
});

/**
 * Space-joined `.variable` classes — apply on <html> so the CSS vars are
 * available everywhere. All three resolve to Rubik.
 */
export const fontsVariables = `${fontSerif.variable} ${fontSans.variable} ${fontMono.variable}`;
