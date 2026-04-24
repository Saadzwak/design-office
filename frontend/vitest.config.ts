/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * iter-25 (Saad, 2026-04-25) — Vitest config kept in its own file so the
 * dev-time `vite.config.ts` stays minimal. Adding `test` to the dev config
 * inadvertently pulled jsdom + testing-library into the optimized deps
 * bundle and caused a duplicate-React load on the dev server. Splitting
 * keeps prod / dev untouched.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
