/**
 * Fonts are exposed as CSS variables so Tailwind can pick them up via
 * `font-sans` / `font-serif` / `font-mono`.
 *
 * We deliberately avoid `next/font/google` because:
 *   1. It blocks the build when offline / when sandboxed networks can't
 *      reach fonts.googleapis.com.
 *   2. System UI fonts on modern macOS / Windows are already excellent
 *      for "premium" feel (SF Pro / Segoe UI Variable).
 *
 * To restore the Geist + Instrument Serif look, install
 * `geist` and use `GeistSans` from "geist/font/sans" — that ships
 * the fonts bundled in node_modules so no network is needed.
 */
export const fontsVariables =
  "[--font-geist:'Inter','Segoe_UI_Variable','SF_Pro_Text',ui-sans-serif,system-ui,sans-serif] " +
  "[--font-serif:'Iowan_Old_Style','Apple_Garamond','Baskerville','Times_New_Roman',serif] " +
  "[--font-mono:ui-monospace,'JetBrains_Mono','SF_Mono','Cascadia_Code',Menlo,monospace]";
