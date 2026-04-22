import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Section 11 palette
        ink: {
          DEFAULT: "#0E0E0C",
          soft: "#181816",
        },
        bone: {
          DEFAULT: "#FAF9F5",
          text: "#ECEBE4",
        },
        terracotta: "#C9694E",
        ochre: "#A68A5B",
        neutral: {
          50: "#F5F4EF",
          100: "#E6E4DC",
          200: "#CFCCC0",
          300: "#A7A398",
          400: "#75716A",
          500: "#4F4D48",
          600: "#34332F",
          700: "#22211E",
          800: "#17161400",
          900: "#0E0E0C",
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "20px",
      },
      boxShadow: {
        "soft-lg": "0 24px 60px -30px rgba(0,0,0,0.45)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
