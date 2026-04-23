import { describe, expect, it } from "vitest";

import { variantToDesign } from "../variantAdapter";
import type { FloorPlan, VariantOutput } from "../../api";

const LUMEN_PLAN: FloorPlan = {
  level: 0,
  name: "Lumen plateau",
  scale_unit: "mm",
  envelope: {
    points: [
      { x: 0, y: 0 },
      { x: 60_000, y: 0 },
      { x: 60_000, y: 40_000 },
      { x: 0, y: 40_000 },
    ],
  },
  columns: [],
  cores: [],
  windows: [],
  doors: [],
  stairs: [],
  text_labels: [],
  source_confidence: 1,
};

function makeVariant(): VariantOutput {
  return {
    style: "atelier",
    title: "Atelier",
    narrative: "Long focus nave.",
    metrics: {
      workstation_count: 100,
      meeting_room_count: 4,
      phone_booth_count: 6,
      collab_surface_m2: 120,
      amenity_surface_m2: 140,
      circulation_m2: 220,
      total_programmed_m2: 1400,
      flex_ratio_applied: 0.76,
      notes: [],
    },
    // Deliberately emit a huge open_work bbox first, then smaller
    // overlapping focus/meeting/biophilic zones that WOULD be hidden
    // under the big one without the biggest-first sort.
    sketchup_trace: [
      {
        tool: "create_workstation_cluster",
        params: { bbox_mm: [2000, 2000, 40000, 16000], name: "Open work" },
      },
      {
        tool: "create_meeting_room",
        params: { bbox_mm: [4000, 3000, 6000, 4000], name: "Huddle" },
      },
      {
        tool: "create_phone_booth",
        params: { bbox_mm: [10000, 3000, 1500, 1500], name: "Booth A" },
      },
      {
        tool: "apply_biophilic_zone",
        params: { bbox_mm: [14000, 3000, 4000, 3000], name: "Plant core" },
      },
    ],
    screenshot_paths: [],
  };
}

describe("variantAdapter · iter-19 C collision guard", () => {
  it("sorts zones biggest-first so small zones render on top", () => {
    const d = variantToDesign(makeVariant(), LUMEN_PLAN);
    const areas = d.zones.map((z) => z.w * z.h);
    for (let i = 1; i < areas.length; i += 1) {
      expect(areas[i - 1]).toBeGreaterThanOrEqual(areas[i]);
    }
    expect(d.zones[0].label).toMatch(/workstation|work|open/i);
    // Biggest zone must come from create_workstation_cluster (area ≈ 640 000 000 mm²).
    expect(d.zones[0].w * d.zones[0].h).toBeGreaterThan(
      d.zones[d.zones.length - 1].w * d.zones[d.zones.length - 1].h,
    );
  });

  it("keeps every non-degenerate zone in the output", () => {
    const v = makeVariant();
    const d = variantToDesign(v, LUMEN_PLAN);
    expect(d.zones).toHaveLength(4);
  });
});
