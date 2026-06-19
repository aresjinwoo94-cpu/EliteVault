import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // EliteVault palette — obsidian + champagne + teal signal
        obsidian: {
          950: "#06060A",
          900: "#0A0A0F",
          800: "#101019",
          700: "#16161F",
          600: "#1C1C26",
          500: "#26262F",
        },
        // champagne — KEYS kept so un-migrated `champagne-*` classes still
        // resolve, but the VALUES are now teal (no gold anywhere in the brand).
        champagne: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF", // primary brand teal (was gold)
          500: "#14B8A6",
          600: "#0D9488",
        },
        signal: {
          // live data / score / proof / signal — teal-green
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF", // primary data/signal
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
        },
        border: "rgb(255 255 255 / 0.06)",
        input: "rgb(255 255 255 / 0.08)",
        ring: "rgb(45 212 191 / 0.5)",
        background: "#0A0A0F",
        foreground: "#FAFAFA",
        muted: {
          DEFAULT: "#16161F",
          foreground: "#9CA3AF",
        },
        card: {
          DEFAULT: "#101019",
          foreground: "#FAFAFA",
        },
        popover: {
          DEFAULT: "#0F0F18",
          foreground: "#FAFAFA",
        },
        primary: {
          DEFAULT: "#2DD4BF",
          foreground: "#06060A",
        },
        secondary: {
          DEFAULT: "#1C1C26",
          foreground: "#FAFAFA",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FAFAFA",
        },
        accent: {
          DEFAULT: "#2DD4BF",
          foreground: "#06060A",
        },
        success: "#22C55E",
        warning: "#FB923C",
      },
      borderRadius: {
        lg: "12px",
        md: "10px",
        sm: "6px",
        xl: "16px",
        "2xl": "20px",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "shine-pulse": {
          "0%,100%": { backgroundPosition: "0% 0%" },
          "50%": { backgroundPosition: "100% 100%" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%,100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "border-spin": {
          "100%": { transform: "rotate(-360deg)" },
        },
        // Analyzer ambient background (teal aurora + scan line) — GPU-only
        // (transform/opacity), so it never reflows.
        "aurora-drift": {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(7%,-5%,0) scale(1.15)" },
        },
        "aurora-drift-2": {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1.1)" },
          "50%": { transform: "translate3d(-6%,4%,0) scale(1)" },
        },
        // Wrapper is full-height; translateY % is relative to its own height,
        // so -18% → 100% sweeps the bar from just above the top to the bottom.
        "scan-sweep": {
          "0%": { transform: "translateY(-18%)", opacity: "0" },
          "12%": { opacity: "0.6" },
          "88%": { opacity: "0.6" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
        "node-pulse": {
          "0%,100%": { opacity: "0.18" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2.4s linear infinite",
        "shine-pulse": "shine-pulse 4s ease-in-out infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        glow: "glow 2.5s ease-in-out infinite",
        "border-spin": "border-spin 7s linear infinite",
        "aurora-drift": "aurora-drift 18s ease-in-out infinite",
        "aurora-drift-2": "aurora-drift-2 22s ease-in-out infinite",
        "scan-sweep": "scan-sweep 7.5s cubic-bezier(0.4,0,0.2,1) infinite",
        "node-pulse": "node-pulse 4s ease-in-out infinite",
      },
      backgroundImage: {
        // KEYS kept (grid-fade / gold-shine) so existing classes keep working,
        // but the color is teal — zero gold.
        "grid-fade":
          "radial-gradient(circle at center, rgba(45,212,191,0.06) 0, transparent 60%)",
        "signal-fade":
          "radial-gradient(circle at center, rgba(45,212,191,0.07) 0, transparent 60%)",
        "gold-shine":
          "linear-gradient(90deg, transparent, rgba(45,212,191,0.5), transparent)",
      },
      boxShadow: {
        // `gold` / `gold-lg` keys kept for `shadow-gold` consumers; color teal.
        gold: "0 0 32px -8px rgba(45, 212, 191, 0.35)",
        "gold-lg": "0 0 80px -12px rgba(45, 212, 191, 0.45)",
        signal: "0 0 32px -8px rgba(45, 212, 191, 0.40)",
        "signal-lg": "0 0 80px -12px rgba(45, 212, 191, 0.45)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [animate],
};

export default config;
