/**
 * Coordinate adapter — normalised ↔ absolute-mm (iter-18 étape 0).
 *
 * The Claude Design bundle assumes every floor plan lives in a fixed
 * normalised grid of 88 × 62 units — a landscape canvas matching the
 * Lumen fixture's 60 m × 40 m aspect closely enough to look right.
 * Our backend emits real floor plans in absolute millimetres with the
 * envelope's bounding box as the scale reference.
 *
 * Every design-bundle 2D primitive (`FloorPlan` from components.jsx,
 * `MacroView` variant previews, `MicroView` zone overlay) must talk
 * through this adapter before it reaches our `FloorPlan` API payload,
 * and the reverse direction converts our backend's mm zones into the
 * 88 × 62 space the bundle renders.
 *
 * Conventions :
 *
 *  - Both spaces share the same axis orientation — we DO NOT flip Y.
 *    Whoever renders (SVG / canvas) handles its own Y direction.
 *    The adapter is pure math over positive reals.
 *  - `PlanSize` is the mm bounding box of the envelope (not the
 *    padded viewBox the `/api/testfit/floor-plan-2d` SVG emits).
 *  - Zones stay axis-aligned rectangles. Rotation is not supported
 *    in this iteration ; the bundle doesn't model it either.
 *  - Inputs outside [0, NORM_W] / [0, NORM_H] are NOT clamped — a
 *    zone sitting off-canvas is a data problem, surfaced downstream.
 *
 * Why a dedicated module : every surface in iter-18 that overlays a
 * zone on a plan (dashboard miniatures, TestFit macro cards, TestFit
 * micro drill-down, zone drawer zoom) will read the same `VariantOutput`
 * and render through these two conversions. Getting it right once
 * avoids silent visual drift across six pages.
 */

/** Landscape horizontal units the bundle assumes for every envelope. */
export const NORM_W = 88;
/** Portrait vertical units the bundle assumes for every envelope. */
export const NORM_H = 62;

/** Absolute-mm envelope size the backend exposes via FloorPlan.envelope.bbox(). */
export type PlanSize = {
  widthMm: number;
  heightMm: number;
};

export type NormalisedPoint = {
  x: number;
  y: number;
};

export type MmPoint = {
  x_mm: number;
  y_mm: number;
};

export type NormalisedZone = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MmZone = {
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
};

function assertFinitePositivePlan(plan: PlanSize): void {
  if (
    !Number.isFinite(plan.widthMm) ||
    !Number.isFinite(plan.heightMm) ||
    plan.widthMm <= 0 ||
    plan.heightMm <= 0
  ) {
    throw new RangeError(
      `Coordinate adapter: PlanSize must have strictly positive finite mm values, received ${JSON.stringify(plan)}`,
    );
  }
}

/**
 * Convert one normalised point to absolute mm.
 *
 * Example (Lumen 60 m × 40 m) :
 *
 *     normalisedToMm({ x: 44, y: 31 }, { widthMm: 60000, heightMm: 40000 })
 *     // → { x_mm: 30000, y_mm: 20000 }   (plate centre)
 */
export function normalisedToMm(
  point: NormalisedPoint,
  plan: PlanSize,
): MmPoint {
  assertFinitePositivePlan(plan);
  return {
    x_mm: (point.x / NORM_W) * plan.widthMm,
    y_mm: (point.y / NORM_H) * plan.heightMm,
  };
}

/**
 * Convert one absolute-mm point to the bundle's normalised 88 × 62 space.
 *
 * Example (Lumen) :
 *
 *     mmToNormalised({ x_mm: 30000, y_mm: 20000 }, { widthMm: 60000, heightMm: 40000 })
 *     // → { x: 44, y: 31 }
 */
export function mmToNormalised(point: MmPoint, plan: PlanSize): NormalisedPoint {
  assertFinitePositivePlan(plan);
  return {
    x: (point.x_mm / plan.widthMm) * NORM_W,
    y: (point.y_mm / plan.heightMm) * NORM_H,
  };
}

/**
 * Convert a normalised rectangle zone to absolute-mm coordinates.
 *
 * Safe under degenerate zones — if `w` or `h` is 0 the output width /
 * height stays 0 (clamped by a `Math.max(0, …)` guard to survive
 * floating-point drift).
 *
 * Example (Lumen "Focus Village A" from data.js) :
 *
 *     normalisedZoneToMm(
 *       { x: 4, y: 6, w: 28, h: 34 },
 *       { widthMm: 60000, heightMm: 40000 },
 *     )
 *     // → { x_mm: 2727.27…, y_mm: 3870.97…, w_mm: 19090.90…, h_mm: 21935.48… }
 */
export function normalisedZoneToMm(zone: NormalisedZone, plan: PlanSize): MmZone {
  assertFinitePositivePlan(plan);
  const origin = normalisedToMm({ x: zone.x, y: zone.y }, plan);
  const far = normalisedToMm({ x: zone.x + zone.w, y: zone.y + zone.h }, plan);
  return {
    x_mm: origin.x_mm,
    y_mm: origin.y_mm,
    w_mm: Math.max(0, far.x_mm - origin.x_mm),
    h_mm: Math.max(0, far.y_mm - origin.y_mm),
  };
}

/**
 * Convert an absolute-mm rectangle zone into the bundle's 88 × 62
 * normalised space. Round-trips exactly with normalisedZoneToMm.
 *
 * Example (Lumen envelope-filling zone) :
 *
 *     mmZoneToNormalised(
 *       { x_mm: 0, y_mm: 0, w_mm: 60000, h_mm: 40000 },
 *       { widthMm: 60000, heightMm: 40000 },
 *     )
 *     // → { x: 0, y: 0, w: 88, h: 62 }
 */
export function mmZoneToNormalised(zone: MmZone, plan: PlanSize): NormalisedZone {
  assertFinitePositivePlan(plan);
  const origin = mmToNormalised({ x_mm: zone.x_mm, y_mm: zone.y_mm }, plan);
  const far = mmToNormalised(
    { x_mm: zone.x_mm + zone.w_mm, y_mm: zone.y_mm + zone.h_mm },
    plan,
  );
  return {
    x: origin.x,
    y: origin.y,
    w: Math.max(0, far.x - origin.x),
    h: Math.max(0, far.y - origin.y),
  };
}

/**
 * Given a FloorPlan-compatible envelope polygon (array of points in mm),
 * compute the axis-aligned bounding box and return it as a `PlanSize`.
 *
 * Useful glue for callers that have a full FloorPlan.envelope but
 * want the plan's size in one go.
 */
export function planSizeFromEnvelope(
  points: ReadonlyArray<{ x: number; y: number }>,
): PlanSize {
  if (points.length < 3) {
    throw new RangeError(
      `Coordinate adapter: envelope polygon needs at least 3 points, received ${points.length}`,
    );
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const widthMm = maxX - minX;
  const heightMm = maxY - minY;
  assertFinitePositivePlan({ widthMm, heightMm });
  return { widthMm, heightMm };
}
