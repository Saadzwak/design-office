/**
 * UI primitives — Claude Design bundle parity.
 *
 * Every primitive the ported screens import. Keep this file the single
 * source for all `ui/` symbols so refactors reach via one grep.
 */

export { default as AgentTrace } from "./AgentTrace";
export type { AgentRow, AgentStatus } from "./AgentTrace";

export { default as Card } from "./Card";
export { default as DotPulse } from "./DotPulse";
export { default as DotStatus } from "./DotStatus";
export { default as Drawer } from "./Drawer";
export { default as Eyebrow } from "./Eyebrow";
export { default as FloorPlan2D, ZONE_COLORS } from "./FloorPlan2D";
export type { Zone, ZoneKind } from "./FloorPlan2D";
export { default as Icon } from "./Icon";
export type { IconName } from "./Icon";
export { default as IntegrationBadge } from "./IntegrationBadge";
export { default as MetricBadge } from "./MetricBadge";
export { default as Pill } from "./Pill";
export { default as PillToggle } from "./PillToggle";
export { default as Placeholder } from "./Placeholder";
export { default as TypewriterText } from "./TypewriterText";
/** Bundle-parity alias — the bundle's `Typewriter` matches our
 *  `TypewriterText`. */
export { default as Typewriter } from "./TypewriterText";
export { default as ViewModeToggle } from "./ViewModeToggle";

// Roman numeral helper — used across Brief / TestFit / Justify /
// Export cards to number sections editorial-style.
const ROMANS = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
  "XIII",
  "XIV",
  "XV",
];
export function roman(n: number): string {
  return ROMANS[n] ?? String(n);
}
