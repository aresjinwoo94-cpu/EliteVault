import localFont from "next/font/local";

/**
 * Self-hosted, bundled type system — THREE roles, one source of truth.
 *
 *   • DISPLAY  → General Sans (Fontshare, weights 500 & 600). Backs
 *     `--font-display`, which every heading reads (via the Tailwind `serif`
 *     key + the `.text-display` / `.text-h1` / `.text-h2` / `.hero-h1` scale).
 *     A distinctive geometric-humanist sans: reads like a serious instrument,
 *     keeps personality — replacing the earlier editorial serif display.
 *   • BODY / UI → Rubik. Backs `--font-geist` (`font-sans`) — paragraphs,
 *     buttons, nav, UI.
 *   • MONO      → JetBrains Mono. Backs `--font-mono` (`font-mono` / `.num`),
 *     the voice of DATA: score /100, %, prices, every metric — tabular-nums.
 *
 * All three faces are self-hosted `.woff2` in `public/fonts` and loaded via
 * `next/font/local`, so the build needs NO network and there is no FOUT.
 */
const fontDisplay = localFont({
  src: [
    { path: "../public/fonts/general-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/general-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Rubik", "system-ui", "sans-serif"],
});

const fontBody = localFont({
  src: "../public/fonts/rubik.woff2",
  variable: "--font-geist",
  display: "swap",
  weight: "300 700",
  fallback: ["Inter", "Segoe UI Variable", "system-ui", "sans-serif"],
});

const fontMono = localFont({
  src: "../public/fonts/jetbrains-mono.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "400 600",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

/**
 * Space-joined `.variable` classes — apply on <html> so the CSS vars are
 * available everywhere: `--font-display` (General Sans), `--font-geist` (Rubik),
 * `--font-mono` (JetBrains Mono).
 */
export const fontsVariables = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`;
