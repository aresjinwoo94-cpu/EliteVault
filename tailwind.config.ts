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
        // EliteVault palette — obsidian + champagne + AI violet
        obsidian: {
          950: "#06060A",
          900: "#0A0A0F",
          800: "#101019",
          700: "#16161F",
          600: "#1C1C26",
          500: "#26262F",
        },
        champagne: {
          50: "#FFF8E1",
          100: "#FBEFC6",
          200: "#F2DC8F",
          300: "#E7C75E",
          400: "#D4AF37", // primary gold
          500: "#B89026",
          600: "#8A6A1A",
        },
        violet: {
          // AI accent
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
        border: "rgb(255 255 255 / 0.06)",
        input: "rgb(255 255 255 / 0.08)",
        ring: "rgb(212 175 55 / 0.5)",
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
          DEFAULT: "#D4AF37",
          foreground: "#0A0A0F",
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
          DEFAULT: "#7C3AED",
          foreground: "#FAFAFA",
        },
        success: "#10B981",
        warning: "#F59E0B",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2.4s linear infinite",
        "shine-pulse": "shine-pulse 4s ease-in-out infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        glow: "glow 2.5s ease-in-out infinite",
        "border-spin": "border-spin 7s linear infinite",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at center, rgba(212,175,55,0.06) 0, transparent 60%)",
        "gold-shine":
          "linear-gradient(90deg, transparent, rgba(212,175,55,0.5), transparent)",
      },
      boxShadow: {
        gold: "0 0 32px -8px rgba(212, 175, 55, 0.35)",
        "gold-lg": "0 0 80px -12px rgba(212, 175, 55, 0.45)",
        violet: "0 0 32px -8px rgba(124, 58, 237, 0.45)",
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [animate],
};

export default config;
