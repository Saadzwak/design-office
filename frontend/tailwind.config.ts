import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/**
 * Design Office — Organic Modern palette (iter-18 reconciled with the
 * Claude Design handoff bundle `claude-design-bundle/opus-4-7/project/
 * src/tokens.css`, source of visual truth per Saad's non-negotiables).
 *
 * Semantic tokens (use these, not raw colour names):
 *   canvas / canvas-alt / raised  — page + card backgrounds (warm ivory)
 *   ink / ink-heavy / ink-soft / ink-muted — primary/secondary/tertiary text
 *   forest / forest-2 / forest-dark / forest-soft / forest-ghost
 *     — primary accent (CTAs, links, hover)
 *   sand / sand-2 / sand-deep     — secondary wood accent
 *   sun                           — highlights, success
 *   mint                          — biophilic / positive-adjacency
 *   clay                          — error, destructive (warm red)
 *   mist-50 … mist-900            — warm neutral gray scale
 *
 * Mist scale realigned to the bundle's warmer, lighter values
 * (diff documented in docs/CLAUDE_DESIGN_HANDOFF_REPORT.md §c).
 * The stray malformed `mist-900: "#15141200"` (8-char hex with an
 * accidental alpha byte) is fixed to `#1A1816`.
 */

const palette = {
  // Canvas (ivory base)
  canvas: "#FAF7F2",
  "canvas-alt": "#F3EEE5",
  raised: "#FFFCF6",
  hairline: "#E8E3D8",

  // Ink (primary text on ivory)
  ink: "#1C1F1A",
  "ink-heavy": "#2A2E28",
  "ink-soft": "#5A5E53",
  "ink-muted": "#8C8F84",

  // Forest (primary accent)
  forest: "#2F4A3F",
  "forest-2": "#3C5D50",
  "forest-dark": "#1E2F28",
  "forest-soft": "#4A6B5E",
  "forest-ghost": "rgba(47, 74, 63, 0.08)",

  // Sand / wood secondary
  sand: "#C9B79C",
  "sand-2": "#E4D7C1",
  "sand-deep": "#A8967D",
  "sand-soft": "#E4D7C1",

  // Sun (highlight)
  sun: "#E8C547",
  "sun-soft": "#F2DD8F",

  // Mint (biophilic / positive)
  mint: "#6B8F7F",

  // Clay (error, warm red)
  clay: "#A0522D",
  "clay-soft": "#CE7A53",

  // Warm neutrals (mist) — bundle-aligned
  "mist-50": "#F6F3EE",
  "mist-100": "#EDE8DF",
  "mist-200": "#DDD6C9",
  "mist-300": "#C5BCAC",
  "mist-400": "#A49B8B",
  "mist-500": "#7F776A",
  "mist-600": "#5F584E",
  "mist-700": "#423D36",
  "mist-800": "#2B2824",
  "mist-900": "#1A1816",
};

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (preferred)
        canvas: palette.canvas,
        "canvas-alt": palette["canvas-alt"],
        raised: palette.raised,
        hairline: palette.hairline,
        ink: {
          DEFAULT: palette.ink,
          heavy: palette["ink-heavy"],
          soft: palette["ink-soft"],
          muted: palette["ink-muted"],
        },
        forest: {
          DEFAULT: palette.forest,
          2: palette["forest-2"],
          dark: palette["forest-dark"],
          soft: palette["forest-soft"],
          ghost: palette["forest-ghost"],
        },
        sand: {
          DEFAULT: palette.sand,
          2: palette["sand-2"],
          deep: palette["sand-deep"],
          soft: palette["sand-soft"],
        },
        sun: {
          DEFAULT: palette.sun,
          soft: palette["sun-soft"],
        },
        mint: palette.mint,
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
        eyebrow: "0.14em",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        // Bundle standardised on 18px for the 2xl token (hero cards,
        // project detail band). Up from our previous 16px.
        "2xl": "18px",
        "3xl": "24px",
      },
      boxShadow: {
        // Bundle-aligned — slightly more pronounced than the previous
        // hairline-soft shadows so cards feel present on ivory.
        soft: "0 1px 2px rgba(28, 31, 26, 0.04), 0 4px 12px rgba(28, 31, 26, 0.05)",
        lift: "0 2px 4px rgba(28, 31, 26, 0.05), 0 12px 24px rgba(28, 31, 26, 0.07)",
        hero: "0 24px 48px rgba(28, 31, 26, 0.08)",
        drawer: "-24px 0 48px rgba(28, 31, 26, 0.08)",
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
          // Bundle spec : pure transform, no opacity, 3 s cycle.
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.03)" },
        },
        "dot-pulse": {
          // Bundle spec : opacity 0.3 → 1 + scale 0.9 → 1.1, 1.1 s cycle.
          "0%, 100%": { opacity: "0.3", transform: "scale(0.9)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
        },
        "blink-caret": {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
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
        "fade-rise": "fade-rise 360ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "soft-breathe": "soft-breathe 3s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "dot-pulse": "dot-pulse 1.1s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "blink-caret": "blink-caret 900ms step-end infinite",
        shimmer: "shimmer 2.2s ease-in-out infinite",
        marquee: "marquee 50s linear infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
