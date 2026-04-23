import { describe, expect, it } from "vitest";

import {
  mmToNormalised,
  mmZoneToNormalised,
  normalisedToMm,
  normalisedZoneToMm,
  planSizeFromEnvelope,
  NORM_H,
  NORM_W,
  type MmZone,
  type NormalisedZone,
  type PlanSize,
} from "../coordinates";

/**
 * Lumen — 60 m × 40 m plate, matches `backend/app/data/fixtures/lumen_plan.pdf`
 * and the iter-17 live run in `generate_with_adjacency_sample.json`.
 */
const LUMEN: PlanSize = { widthMm: 60_000, heightMm: 40_000 };
/** A narrow floorplate, 15 m × 30 m, stresses the non-square path. */
const NARROW: PlanSize = { widthMm: 15_000, heightMm: 30_000 };

/** Real zones verbatim from the Claude Design handoff `data.js`. */
const BUNDLE_ZONES: Array<{ label: string; zone: NormalisedZone }> = [
  { label: "Focus Village A", zone: { x: 4, y: 6, w: 28, h: 34 } },
  { label: "Focus Village B", zone: { x: 34, y: 6, w: 28, h: 34 } },
  { label: "Ritual Table", zone: { x: 64, y: 6, w: 20, h: 20 } },
  { label: "Biophilic Core", zone: { x: 4, y: 42, w: 16, h: 18 } },
  { label: "Boardroom", zone: { x: 38, y: 42, w: 22, h: 18 } },
];

describe("coordinates · constants", () => {
  it("keeps the 88 × 62 grid stable", () => {
    expect(NORM_W).toBe(88);
    expect(NORM_H).toBe(62);
  });
});

describe("normalisedToMm · happy path", () => {
  it("maps the origin to (0, 0)", () => {
    expect(normalisedToMm({ x: 0, y: 0 }, LUMEN)).toEqual({ x_mm: 0, y_mm: 0 });
  });

  it("maps (NORM_W, NORM_H) to the envelope corner", () => {
    expect(normalisedToMm({ x: NORM_W, y: NORM_H }, LUMEN)).toEqual({
      x_mm: 60_000,
      y_mm: 40_000,
    });
  });

  it("maps the plate centre exactly", () => {
    const centre = normalisedToMm({ x: 44, y: 31 }, LUMEN);
    expect(centre.x_mm).toBeCloseTo(30_000, 9);
    expect(centre.y_mm).toBeCloseTo(20_000, 9);
  });

  it("handles non-square envelopes without distortion", () => {
    const a = normalisedToMm({ x: NORM_W / 2, y: NORM_H / 2 }, NARROW);
    expect(a.x_mm).toBeCloseTo(7_500, 9);
    expect(a.y_mm).toBeCloseTo(15_000, 9);
  });
});

describe("mmToNormalised · happy path", () => {
  it("round-trips every bundle zone origin through the adapter", () => {
    for (const { label, zone } of BUNDLE_ZONES) {
      const mm = normalisedToMm({ x: zone.x, y: zone.y }, LUMEN);
      const back = mmToNormalised(mm, LUMEN);
      expect(back.x, `${label} · x`).toBeCloseTo(zone.x, 9);
      expect(back.y, `${label} · y`).toBeCloseTo(zone.y, 9);
    }
  });

  it("places the Lumen plate centre at (44, 31)", () => {
    const n = mmToNormalised({ x_mm: 30_000, y_mm: 20_000 }, LUMEN);
    expect(n.x).toBeCloseTo(44, 9);
    expect(n.y).toBeCloseTo(31, 9);
  });
});

describe("normalisedZoneToMm · zones", () => {
  it("converts 'Focus Village A' into absolute mm matching Lumen's plate", () => {
    // Lumen plate is 60 m × 40 m = 60000 × 40000 mm. The zone spans
    // 4..32 horizontally in norm units → 4/88*60000 .. 32/88*60000 mm.
    const got = normalisedZoneToMm({ x: 4, y: 6, w: 28, h: 34 }, LUMEN);
    expect(got.x_mm).toBeCloseTo((4 / 88) * 60_000, 6);
    expect(got.y_mm).toBeCloseTo((6 / 62) * 40_000, 6);
    expect(got.w_mm).toBeCloseTo((28 / 88) * 60_000, 6);
    expect(got.h_mm).toBeCloseTo((34 / 62) * 40_000, 6);
  });

  it("fills the whole envelope when given the full norm rectangle", () => {
    const filled = normalisedZoneToMm(
      { x: 0, y: 0, w: NORM_W, h: NORM_H },
      LUMEN,
    );
    expect(filled).toEqual({ x_mm: 0, y_mm: 0, w_mm: 60_000, h_mm: 40_000 });
  });

  it("survives a degenerate zero-width zone without negative w", () => {
    const degenerate = normalisedZoneToMm({ x: 10, y: 10, w: 0, h: 8 }, LUMEN);
    expect(degenerate.w_mm).toBe(0);
    expect(degenerate.h_mm).toBeCloseTo((8 / 62) * 40_000, 6);
  });

  it("keeps rectangles non-overlapping when they weren't in norm space", () => {
    // Two zones touching but not overlapping in norm space must also touch
    // but not overlap in mm space, i.e. far edge of A == near edge of B.
    const a = normalisedZoneToMm({ x: 10, y: 10, w: 20, h: 20 }, LUMEN);
    const b = normalisedZoneToMm({ x: 30, y: 10, w: 20, h: 20 }, LUMEN);
    expect(a.x_mm + a.w_mm).toBeCloseTo(b.x_mm, 6);
  });
});

describe("mmZoneToNormalised · zones", () => {
  it("converts the full mm envelope into the 88 × 62 full rectangle", () => {
    const full: MmZone = { x_mm: 0, y_mm: 0, w_mm: 60_000, h_mm: 40_000 };
    const n = mmZoneToNormalised(full, LUMEN);
    expect(n).toEqual({ x: 0, y: 0, w: NORM_W, h: NORM_H });
  });

  it("is the exact inverse of normalisedZoneToMm", () => {
    for (const { label, zone } of BUNDLE_ZONES) {
      const mm = normalisedZoneToMm(zone, LUMEN);
      const back = mmZoneToNormalised(mm, LUMEN);
      expect(back.x, `${label} · x`).toBeCloseTo(zone.x, 9);
      expect(back.y, `${label} · y`).toBeCloseTo(zone.y, 9);
      expect(back.w, `${label} · w`).toBeCloseTo(zone.w, 9);
      expect(back.h, `${label} · h`).toBeCloseTo(zone.h, 9);
    }
  });
});

describe("PlanSize validation", () => {
  it("throws on zero width", () => {
    expect(() =>
      normalisedToMm({ x: 0, y: 0 }, { widthMm: 0, heightMm: 40_000 }),
    ).toThrowError(/strictly positive/);
  });

  it("throws on NaN / Infinity", () => {
    expect(() =>
      normalisedToMm({ x: 0, y: 0 }, { widthMm: Number.NaN, heightMm: 1000 }),
    ).toThrowError();
    expect(() =>
      normalisedToMm({ x: 0, y: 0 }, { widthMm: Number.POSITIVE_INFINITY, heightMm: 1000 }),
    ).toThrowError();
  });

  it("throws on negative plan dimensions", () => {
    expect(() =>
      normalisedToMm({ x: 0, y: 0 }, { widthMm: -10, heightMm: 40_000 }),
    ).toThrowError();
  });
});

describe("planSizeFromEnvelope", () => {
  it("computes the Lumen bounding box from the fixture's four corners", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: 60_000, y: 0 },
      { x: 60_000, y: 40_000 },
      { x: 0, y: 40_000 },
    ];
    expect(planSizeFromEnvelope(corners)).toEqual(LUMEN);
  });

  it("handles an unordered polygon — bbox is position-agnostic", () => {
    const shuffled = [
      { x: 60_000, y: 40_000 },
      { x: 0, y: 0 },
      { x: 60_000, y: 0 },
      { x: 0, y: 40_000 },
    ];
    expect(planSizeFromEnvelope(shuffled)).toEqual(LUMEN);
  });

  it("handles an L-shaped polygon by taking the enclosing rectangle", () => {
    // L-shape carved out of an 80 m × 50 m envelope (carve a 20 m × 20 m
    // chunk out of the top-right corner).
    const lShape = [
      { x: 0, y: 0 },
      { x: 80_000, y: 0 },
      { x: 80_000, y: 30_000 },
      { x: 60_000, y: 30_000 },
      { x: 60_000, y: 50_000 },
      { x: 0, y: 50_000 },
    ];
    expect(planSizeFromEnvelope(lShape)).toEqual({
      widthMm: 80_000,
      heightMm: 50_000,
    });
  });

  it("refuses polygons with fewer than 3 points", () => {
    expect(() => planSizeFromEnvelope([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrowError(
      /at least 3 points/,
    );
  });
});
