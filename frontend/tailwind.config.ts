import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/**
 * Design Office — Organic Modern palette.
 *
 * Semantic tokens (use these, not raw colour names):
 *   canvas / raised          — page + card backgrounds (warm ivory)
 *   ink / ink-soft / ink-muted — primary/secondary/tertiary text
 *   forest / forest-dark / forest-light — primary accent (CTAs, links)
 *   sand / sand-deep         — secondary wood accent
 *   sun                      — highlights, success
 *   clay                     — error, destructive (warm red)
 *   mist-50 … mist-900       — warm neutral gray scale
 */

const palette = {
  // Canvas (ivory base)
  canvas: "#FAF7F2",
  raised: "#FFFCF6",
  hairline: "#E8E3D8",

  // Ink (primary text on ivory)
  ink: "#1C1F1A",
  "ink-soft": "#5A5E53",
  "ink-muted": "#8C8F84",

  // Forest (primary accent)
  forest: "#2F4A3F",
  "forest-dark": "#1E2F28",
  "forest-soft": "#4A6B5E",

  // Sand / wood secondary
  sand: "#C9B79C",
  "sand-deep": "#A8967D",
  "sand-soft": "#E5DAC4",

  // Sun (highlight)
  sun: "#E8C547",
  "sun-soft": "#F2DD8F",

  // Clay (error, warm red)
  clay: "#A0522D",
  "clay-soft": "#CE7A53",

  // Warm neutrals (mist)
  "mist-50": "#F4F1EA",
  "mist-100": "#E8E3D8",
  "mist-200": "#D4CEC0",
  "mist-300": "#B8B2A4",
  "mist-400": "#8F8A7F",
  "mist-500": "#6F6B62",
  "mist-600": "#504D46",
  "mist-700": "#363431",
  "mist-800": "#23221F",
  "mist-900": "#15141200",
};

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (preferred)
        canvas: palette.canvas,
        raised: palette.raised,
        hairline: palette.hairline,
        ink: {
          DEFAULT: palette.ink,
          soft: palette["ink-soft"],
          muted: palette["ink-muted"],
        },
        forest: {
          DEFAULT: palette.forest,
          dark: palette["forest-dark"],
          soft: palette["forest-soft"],
        },
        sand: {
          DEFAULT: palette.sand,
          deep: palette["sand-deep"],
          soft: palette["sand-soft"],
        },
        sun: {
          DEFAULT: palette.sun,
          soft: palette["sun-soft"],
        },
        clay: {
          DEFAULT: palette.clay,
          soft: palette["clay-soft"],
        },
        mist: {
          50: palette["mist-50"],
          100: palette["mist-100"],
          200: palette["mist-200"],
          300: palette["mist-300"],
          400: palette["mist-400"],
          500: palette["mist-500"],
          600: palette["mist-600"],
          700: palette["mist-700"],
          800: palette["mist-800"],
          900: palette["mist-900"],
        },
      },
      fontFamily: {
        // Fraunces variable (opsz 9-144, wght 100-900, SOFT 0-100) for
        // editorial display + headings.
        display: [
          "Fraunces",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        serif: [
          "Fraunces",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      fontSize: {
        // Editorial display scale.
        "display-sm": ["3.25rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        display: ["4.5rem", { lineHeight: "0.98", letterSpacing: "-0.025em" }],
        "display-lg": ["6rem", { lineHeight: "0.96", letterSpacing: "-0.03em" }],
        "display-xl": ["7.5rem", { lineHeight: "0.92", letterSpacing: "-0.035em" }],
      },
      letterSpacing: {
        label: "0.18em",
        eyebrow: "0.28em",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "24px",
      },
      boxShadow: {
        // Subtle, never heavy.
        soft: "0 1px 2px rgba(28, 31, 26, 0.04), 0 0 1px rgba(28, 31, 26, 0.06)",
        lift: "0 8px 28px -12px rgba(28, 31, 26, 0.12), 0 2px 4px rgba(28, 31, 26, 0.04)",
        drawer: "-16px 0 48px -24px rgba(28, 31, 26, 0.18)",
      },
      transitionTimingFunction: {
        "out-gentle": "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-rise": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "soft-breathe": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.03)", opacity: "0.92" },
        },
        "dot-pulse": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-rise": "fade-rise 300ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "soft-breathe": "soft-breathe 4.5s ease-in-out infinite",
        "dot-pulse": "dot-pulse 1.4s ease-in-out infinite",
        shimmer: "shimmer 2.2s ease-in-out infinite",
        marquee: "marquee 50s linear infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
