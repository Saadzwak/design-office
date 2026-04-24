/**
 * Variant adapter — our `VariantOutput` → the design bundle's variant shape.
 *
 * The bundle renders each test-fit variant as a card with :
 *
 *   { id, name, pigment, pitch, metrics: { desks, density, flex, adjacency },
 *     warnings: [{ text, kind }], zones: [{ label, kind, x, y, w, h }] }
 *
 * Our backend emits a `VariantOutput` with a structured metrics object,
 * an `adjacency_audit`, and a `sketchup_trace` of MCP tool calls (each
 * with a `bbox_mm` or `position_mm` / `origin_mm` in absolute millimetres).
 *
 * This adapter walks the trace, filters the tools that map to visible
 * zones, converts their bboxes through the coordinate adapter, and fans
 * the `adjacency_audit.violations[]` into warning pills. Every piece of
 * information the bundle's JSX assumes comes out the other side.
 */

import type {
  FloorPlan,
  ReviewerVerdict,
  VariantOutput,
  VariantStyle,
} from "../api";
import {
  mmZoneToNormalised,
  planSizeFromEnvelope,
  type NormalisedZone,
  type PlanSize,
} from "./coordinates";
import type { ZoneKind } from "../../components/ui/FloorPlan2D";

/**
 * Tool → functional category. Kept in lock-step with the backend's
 * `floorplan_svg.py · _TOOL_CATEGORY` so the 2D SVG renderer and this
 * frontend adapter categorise the same way. Unknown tools fall back
 * to "support" (a muted clay tint that still reads as "something's here").
 */
const TOOL_KIND: Record<string, ZoneKind> = {
  create_workstation_cluster: "work",
  create_focus_room: "work",
  create_meeting_room: "collab",
  create_huddle: "collab",
  create_training_room: "collab",
  create_collab_zone: "collab",
  create_phone_booth: "support",
  create_print_alcove: "support",
  create_storage_wall: "support",
  create_partition_wall: "support",
  create_cafe: "hospitality",
  create_kitchenette: "hospitality",
  create_town_hall: "hospitality",
  create_hospitality_zone: "hospitality",
  apply_biophilic_zone: "biophilic",
  create_wellness_pod: "biophilic",
};

export type DesignVariant = {
  id: VariantStyle;
  /** Human-readable name ("Villageois", "Atelier", "Hybride flex"). */
  name: string;
  /** Token on the palette that tints the variant chip + shadow. */
  pigment: "forest" | "sand" | "mint" | "sun" | "clay";
  /** One-liner pitch for the card. Derived from `VariantOutput.title` or
   *  the first sentence of `narrative` as a fallback. */
  pitch: string;
  metrics: {
    desks: number;
    density: string; // "14.6 m²/FTE"
    flex: string; // "0.76"
    adjacency: string; // "92%"
  };
  warnings: Array<{ text: string; kind: "adjacency" | "reviewer" }>;
  zones: Array<NormalisedZone & { label: string; kind: ZoneKind }>;
  /** iter-21e — existing rooms + interior walls, normalised into 88×62.
   *  Empty when Vision saw no interior partitioning. */
  rooms: Array<NormalisedZone & { label: string | null; kind: string }>;
  walls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thicknessMm: number;
    isLoadBearing: boolean | null;
  }>;
  /** Pass-through for when a card wants to drill back to the raw output. */
  raw: VariantOutput;
};

const STYLE_NAME: Record<VariantStyle, string> = {
  villageois: "Villageois",
  atelier: "Atelier",
  hybride_flex: "Hybride flex",
};

const STYLE_PIGMENT: Record<VariantStyle, DesignVariant["pigment"]> = {
  villageois: "forest",
  atelier: "sand",
  hybride_flex: "mint",
};

/** Extract a zone bbox from the variant's sketchup_trace entry. Returns
 *  `null` for entries that don't carry a visible footprint. */
function bboxFromTrace(params: Record<string, unknown>): {
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
} | null {
  const bbox = params["bbox_mm"];
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [x, y, w, h] = bbox as [number, number, number, number];
    if (w > 0 && h > 0) return { x_mm: x, y_mm: y, w_mm: w, h_mm: h };
  }

  const c1 = params["corner1_mm"];
  const c2 = params["corner2_mm"];
  if (
    Array.isArray(c1) && c1.length === 2 &&
    Array.isArray(c2) && c2.length === 2
  ) {
    const [x1, y1] = c1 as [number, number];
    const [x2, y2] = c2 as [number, number];
    return {
      x_mm: Math.min(x1, x2),
      y_mm: Math.min(y1, y2),
      w_mm: Math.abs(x2 - x1),
      h_mm: Math.abs(y2 - y1),
    };
  }

  const origin = (params["origin_mm"] ?? params["position_mm"]) as
    | [number, number]
    | undefined;
  if (Array.isArray(origin) && origin.length === 2) {
    const [x, y] = origin;
    // Best-effort footprint for workstation clusters w/ count + spacing.
    const count = Number(params["count"] ?? 1) || 1;
    const spacing = Number(params["row_spacing_mm"] ?? 1600) || 1600;
    const w = Math.max(1600, count * 1600);
    const h = spacing;
    return { x_mm: x, y_mm: y, w_mm: w, h_mm: h };
  }

  return null;
}

function humanLabel(tool: string, params: Record<string, unknown>): string {
  const fromParams = (params["name"] ?? params["label"]) as string | undefined;
  if (typeof fromParams === "string" && fromParams.trim()) return fromParams;
  return tool.replace(/^create_/, "").replace(/_/g, " ").trim();
}

/**
 * Turn a `VariantOutput` (and the plan it was generated against) into
 * the design-bundle-shaped payload the cards + `FloorPlan2D` expect.
 */
export function variantToDesign(
  variant: VariantOutput,
  plan: FloorPlan,
  verdict?: ReviewerVerdict | null,
): DesignVariant {
  const planSize: PlanSize = planSizeFromEnvelope(plan.envelope.points);

  // Derive zones
  const zones: DesignVariant["zones"] = [];
  for (const entry of variant.sketchup_trace ?? []) {
    const tool = String(entry.tool ?? "");
    const params =
      (entry.params as Record<string, unknown> | undefined) ?? {};
    const bbox = bboxFromTrace(params);
    if (!bbox) continue;
    const normalised = mmZoneToNormalised(bbox, planSize);
    if (normalised.w <= 0 || normalised.h <= 0) continue;
    const kind = TOOL_KIND[tool] ?? "support";
    zones.push({
      label: humanLabel(tool, params),
      kind,
      x: normalised.x,
      y: normalised.y,
      w: normalised.w,
      h: normalised.h,
    });
  }
  // Sort biggest-first so small zones render ON TOP of bigger ones in
  // the SVG renderer. Backend macro-zoning routinely emits a large
  // "open_work" bbox that encloses smaller "focus_room" / "huddle"
  // bboxes — without this sort, the smaller zones disappear under the
  // bigger ones (Saad's iter-19 collision bug).
  zones.sort((a, b) => b.w * b.h - a.w * a.h);

  // Derive metrics
  const density =
    variant.metrics.total_programmed_m2 > 0 && variant.metrics.workstation_count > 0
      ? `${(variant.metrics.total_programmed_m2 / variant.metrics.workstation_count).toFixed(1)} m²/FTE`
      : "—";
  const adjacencyScore = variant.adjacency_audit?.score ?? null;
  const adjacencyStr =
    adjacencyScore === null ? "—" : `${adjacencyScore}%`;

  // Derive warnings
  const warnings: DesignVariant["warnings"] = [];
  if (variant.adjacency_audit?.violations?.length) {
    for (const v of variant.adjacency_audit.violations.slice(0, 2)) {
      warnings.push({ text: v.description || v.rule_id, kind: "adjacency" });
    }
  }
  if (verdict && verdict.issues?.length && warnings.length < 2) {
    warnings.push({ text: verdict.issues[0], kind: "reviewer" });
  }

  const pitch = variant.narrative?.split(/\n|\./)[0]?.trim()
    ? variant.narrative.split(/\n|\./)[0].trim() + "."
    : variant.title;

  // Iter-20a (Saad #8) : prefer the agent's title over the hardcoded
  // STYLE_NAME fallback, so a brand-new project gets context-specific
  // variant names (e.g. "The editorial nave · Nordlight" rather than
  // a flat "Atelier" reused across every project).
  //
  // We still fall back to STYLE_NAME when the title is missing or
  // generic ("atelier" / "villageois" / "hybride_flex" verbatim).
  const genericTitles = new Set([
    "villageois",
    "atelier",
    "hybride_flex",
    "hybride flex",
  ]);
  const agentTitle = (variant.title ?? "").trim();
  const displayName = agentTitle && !genericTitles.has(agentTitle.toLowerCase())
    ? agentTitle
    : (STYLE_NAME[variant.style] ?? variant.title ?? variant.style);

  // iter-21e — normalise the existing rooms + interior walls into
  // 88×62 so FloorPlan2D can render them underneath the variant
  // zones. When Vision returned nothing, both arrays stay empty and
  // the card renders exactly as before.
  const roomsNorm: DesignVariant["rooms"] = [];
  for (const r of plan.rooms ?? []) {
    const pts = r.polygon.points;
    if (!pts || pts.length < 3) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const bboxN = mmZoneToNormalised(
      { x_mm: minX, y_mm: minY, w_mm: maxX - minX, h_mm: maxY - minY },
      planSize,
    );
    if (bboxN.w <= 0 || bboxN.h <= 0) continue;
    roomsNorm.push({
      x: bboxN.x,
      y: bboxN.y,
      w: bboxN.w,
      h: bboxN.h,
      label: r.label ?? null,
      kind: r.kind,
    });
  }
  // Sort biggest-first so small rooms render on top of bigger ones
  // (same trick as zones). Labels on small rooms stay visible.
  roomsNorm.sort((a, b) => b.w * b.h - a.w * a.h);

  const wallsNorm: DesignVariant["walls"] = (plan.interior_walls ?? []).map(
    (seg) => {
      const a = {
        x: (seg.start.x / planSize.widthMm) * 88,
        y: (seg.start.y / planSize.heightMm) * 62,
      };
      const b = {
        x: (seg.end.x / planSize.widthMm) * 88,
        y: (seg.end.y / planSize.heightMm) * 62,
      };
      return {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        thicknessMm: seg.thickness_mm,
        isLoadBearing: seg.is_load_bearing ?? null,
      };
    },
  );

  return {
    id: variant.style,
    name: displayName,
    pigment: STYLE_PIGMENT[variant.style] ?? "forest",
    pitch,
    metrics: {
      desks: variant.metrics.workstation_count,
      density,
      flex: variant.metrics.flex_ratio_applied.toFixed(2),
      adjacency: adjacencyStr,
    },
    warnings,
    zones,
    rooms: roomsNorm,
    walls: wallsNorm,
    raw: variant,
  };
}

export function variantsToDesign(
  variants: VariantOutput[],
  plan: FloorPlan,
  verdicts: ReviewerVerdict[] = [],
): DesignVariant[] {
  const verdictByStyle = new Map(verdicts.map((v) => [v.style, v]));
  return variants.map((v) =>
    variantToDesign(v, plan, verdictByStyle.get(v.style) ?? null),
  );
}
