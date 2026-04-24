/**
 * iter-25 — Vitest setup. Wires @testing-library/jest-dom's custom
 * DOM matchers (`toBeInTheDocument`, `toHaveAttribute`, …) and runs
 * `cleanup` after each test so rendered DOM from one test doesn't
 * leak into the next.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});
