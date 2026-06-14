import localFont from "next/font/local";

/**
 * Self-hosted, bundled fonts — the real "Obsidian Quant" type opinion.
 *
 * Files live in `public/fonts/*.woff2` and are loaded via `next/font/local`,
 * so the build needs NO network (downloaded once at dev time) and renders
 * identically on every machine — fixing the system-font-fallback look.
 *
 * Variable names are kept EXACTLY as before (`--font-serif`, `--font-geist`,
 * `--font-mono`) so `tailwind.config.ts` (font-serif/sans/mono) and every
 * existing className keep working untouched.
 *
 *   --font-serif → Fraunces   — editorial display serif: wordmark + headlines
 *   --font-geist → Geist Sans — UI + body
 *   --font-mono  → Geist Mono — all numbers / metrics / labels
 */
const fontSerif = localFont({
  src: "../public/fonts/fraunces.woff2",
  variable: "--font-serif",
  display: "swap",
  weight: "100 900",
  fallback: ["Iowan Old Style", "Georgia", "Times New Roman", "serif"],
});

const fontSans = localFont({
  src: "../public/fonts/geist-sans.woff2",
  variable: "--font-geist",
  display: "swap",
  weight: "100 900",
  fallback: ["Inter", "Segoe UI Variable", "system-ui", "sans-serif"],
});

const fontMono = localFont({
  src: "../public/fonts/geist-mono.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "100 900",
  fallback: ["ui-monospace", "JetBrains Mono", "SF Mono", "monospace"],
});

/**
 * Space-joined `.variable` classes — apply on <html> so the CSS vars are
 * available everywhere. Replaces the old system-font arbitrary-value string.
 */
export const fontsVariables = `${fontSerif.variable} ${fontSans.variable} ${fontMono.variable}`;
