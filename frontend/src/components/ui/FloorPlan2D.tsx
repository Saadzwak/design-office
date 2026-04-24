import type { CSSProperties, ReactNode } from "react";

import { NORM_H, NORM_W, type NormalisedZone } from "../../lib/adapters/coordinates";

export type ZoneKind =
  | "work"
  | "collab"
  | "support"
  | "hospitality"
  | "biophilic";

export type Zone = NormalisedZone & {
  label: string;
  kind: ZoneKind | string;
};

/**
 * Colour system for the 2D floor plan.
 *
 * Iter-19 C : fill opacity dropped to ~0.20 (was 0.16-0.32) so
 * overlapping zones don't mud into each other. Strokes bumped to
 * 1.5 px with a distinct "halo" (canvas-coloured outline) on each
 * zone so smaller zones stay legible when they sit inside a bigger
 * zone's bbox — a standard cartographic trick.
 */
export const ZONE_COLORS: Record<
  ZoneKind,
  { fill: string; stroke: string; label: string }
> = {
  work: {
    fill: "rgba(47, 74, 63, 0.20)",
    stroke: "#2F4A3F",
    label: "#1C1F1A",
  },
  collab: {
    fill: "rgba(201, 183, 156, 0.30)",
    stroke: "#8A7A5C",
    label: "#1C1F1A",
  },
  support: {
    fill: "rgba(160, 82, 45, 0.22)",
    stroke: "#A0522D",
    label: "#1C1F1A",
  },
  hospitality: {
    fill: "rgba(232, 197, 71, 0.25)",
    stroke: "#B89516",
    label: "#1C1F1A",
  },
  biophilic: {
    fill: "rgba(107, 143, 127, 0.28)",
    stroke: "#6B8F7F",
    label: "#1C1F1A",
  },
};

/**
 * iter-21e — existing interior partitioning, all in 88 × 62 space.
 * Rendered underneath the variant zones as a filigree so the client
 * sees BOTH the as-built rooms AND how the generator places zones on
 * them. Populated by the variantAdapter when the FloorPlan carries
 * Vision-extracted rooms + walls ; empty arrays otherwise.
 */
export type RoomOverlay = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string | null;
  kind: string;
};

export type WallOverlay = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Rough thickness hint — rendered as stroke width scaled to SVG space. */
  thicknessMm: number;
  isLoadBearing: boolean | null;
};

type Props = {
  zones: Zone[];
  /** Render a numbered circle at each zone's centre instead of a corner label. */
  numbered?: boolean;
  /** SVG intrinsic size. Aspect is preserved via `preserveAspectRatio`. */
  size?: { w: number; h: number };
  onZoneClick?: (zone: Zone, index: number) => void;
  /** Highlight one zone with a brighter border and higher opacity. */
  highlightIndex?: number | null;
  className?: string;
  style?: CSSProperties;
  /** Extra elements to render on top of the plan (arrows, annotations). */
  children?: ReactNode;
  ariaLabel?: string;
  /** iter-21e — existing rooms (as-built) drawn in filigree under zones. */
  rooms?: RoomOverlay[];
  /** iter-21e — interior wall segments, drawn above rooms, below zones. */
  walls?: WallOverlay[];
};

/**
 * Inline 2D floor-plan SVG — consumes normalised 88 × 62 zones (our
 * coordinate adapter guarantees this space), draws the envelope +
 * column grid hairlines + zones coloured by functional category +
 * per-zone labels or numbered markers.
 *
 * Iter-19 C overhaul (Saad flagged visual collisions) :
 *
 *   1. Zones render in the incoming order — consumers should sort
 *      biggest-first so smaller overlapping zones stay visible on top.
 *      (`variantAdapter.variantToDesign` does this.)
 *   2. Fill opacity is uniform low (~0.20-0.28) so stacked zones
 *      remain readable through each other.
 *   3. Stroke is 1.5 px in category colour with a 0.5 px canvas halo
 *      underneath for separation.
 *   4. Labels pick a placement strategy per zone size :
 *        - if zone wider than 12 norm units AND taller than 5 AND
 *          the label text fits → centred label.
 *        - elif wider than 8 → corner label, truncated with ellipsis.
 *        - else → label suppressed (zone is too small ; rely on the
 *          numbered circle when `numbered=true`, or on the drawer).
 *   5. Labels render in Inter 10 px bold uppercase tracked +0.08em,
 *      ink colour, with a 2 px canvas-coloured paint-order stroke
 *      underneath for legibility when the label crosses a coloured
 *      zone boundary.
 *   6. Numbered mode keeps the 12 px circle, now with a 2 px canvas
 *      halo so the dot pops on every fill colour.
 */
export default function FloorPlan2D({
  zones,
  numbered = false,
  size = { w: 480, h: 320 },
  onZoneClick,
  highlightIndex = null,
  className = "",
  style,
  children,
  ariaLabel,
  rooms = [],
  walls = [],
}: Props) {
  const { w, h } = size;
  const INSET = 8;
  const INNER_W = w - INSET * 2;
  const INNER_H = h - INSET * 2;

  // iter-21e — normalised 88 × 62 → SVG-pixel mapping for overlay
  // primitives. Rooms as dashed sand polygons, walls as ink strokes.
  const mapX = (nx: number) => INSET + INNER_W * (nx / NORM_W);
  const mapY = (ny: number) => INSET + INNER_H * (ny / NORM_H);
  const shapedRooms = rooms.map((r, i) => ({
    i,
    label: r.label,
    px: mapX(r.x),
    py: mapY(r.y),
    pw: INNER_W * (r.w / NORM_W),
    ph: INNER_H * (r.h / NORM_H),
  }));
  const shapedWalls = walls.map((seg, i) => ({
    i,
    x1: mapX(seg.x1),
    y1: mapY(seg.y1),
    x2: mapX(seg.x2),
    y2: mapY(seg.y2),
    // 150 mm wall in a 25 000 mm-wide envelope → 0.6 % of the width.
    // At w=400 px that's 2.4 px, readable at the card scale. Scale by
    // thickness proportionally, clamp for legibility.
    strokeWidth: Math.min(3, Math.max(0.8, (seg.thicknessMm / 150) * 1.2)),
    isLoadBearing: seg.isLoadBearing,
  }));

  const colFor = (kind: string) =>
    (kind in ZONE_COLORS ? ZONE_COLORS[kind as ZoneKind] : ZONE_COLORS.work);

  // Iter-19 : pre-compute a renderable model per zone, so we can
  // decide label strategy once and keep the JSX simple.
  const shaped = zones.map((z, i) => {
    const col = colFor(z.kind as string);
    const x = INSET + INNER_W * (z.x / NORM_W);
    const y = INSET + INNER_H * (z.y / NORM_H);
    const zw = INNER_W * (z.w / NORM_W);
    const zh = INNER_H * (z.h / NORM_H);
    const labelStrategy: "centre" | "corner" | "none" =
      !numbered && z.w >= 12 && z.h >= 5
        ? "centre"
        : !numbered && z.w >= 8
          ? "corner"
          : "none";
    // Cheap label-fit heuristic : 6 px per character at font-size 10.
    const maxCharsFor = (widthPx: number) =>
      Math.max(3, Math.floor((widthPx - 12) / 6));
    const labelText =
      labelStrategy === "none"
        ? ""
        : truncate(z.label.toUpperCase(), maxCharsFor(zw));
    return {
      z,
      i,
      col,
      x,
      y,
      zw,
      zh,
      labelStrategy,
      labelText,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      className={className}
      style={{
        display: "block",
        background: "var(--canvas-alt)",
        borderRadius: 8,
        ...style,
      }}
      role="img"
      aria-label={ariaLabel ?? "Floor plan 2D"}
    >
      <defs>
        <style>
          {`
            .do-fp-label {
              font-family: 'Inter', system-ui, sans-serif;
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              paint-order: stroke fill;
              stroke: var(--canvas-alt, #F3EEE5);
              stroke-width: 2px;
              stroke-linejoin: round;
            }
            .do-fp-num-bg {
              fill: var(--canvas, #FAF7F2);
              stroke-width: 1.5;
            }
            .do-fp-num {
              font-family: 'JetBrains Mono', ui-monospace, monospace;
              font-size: 11px;
              fill: var(--ink, #1C1F1A);
              font-weight: 500;
            }
          `}
        </style>
      </defs>

      {/* Outer wall */}
      <rect
        x={INSET}
        y={INSET}
        width={INNER_W}
        height={INNER_H}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />

      {/* Inner grid tick */}
      <g opacity={0.1} stroke="var(--ink)" strokeWidth={0.5}>
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={INSET + (INNER_W / 12) * i}
            y1={INSET}
            x2={INSET + (INNER_W / 12) * i}
            y2={h - INSET}
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={INSET}
            y1={INSET + (INNER_H / 8) * i}
            x2={w - INSET}
            y2={INSET + (INNER_H / 8) * i}
          />
        ))}
      </g>

      {/* iter-21e — existing rooms (as-built), drawn in filigree so
          architects see how the generator placed zones on the real
          plan. Dashed sand polygons, semi-transparent fill, ink
          strokes. Hidden when `rooms` is empty. */}
      {shapedRooms.length > 0 && (
        <g pointerEvents="none">
          {shapedRooms.map((r) => (
            <g key={`room-${r.i}`}>
              <rect
                x={r.px}
                y={r.py}
                width={r.pw}
                height={r.ph}
                fill="rgba(201, 183, 156, 0.20)"
                stroke="rgba(28, 31, 26, 0.55)"
                strokeWidth={0.6}
                strokeDasharray="4 2"
                rx={1}
              />
              {r.label && r.pw >= 22 && r.ph >= 12 && (
                <text
                  x={r.px + r.pw / 2}
                  y={r.py + r.ph / 2 + 3}
                  textAnchor="middle"
                  fontFamily="Inter, sans-serif"
                  fontSize={8}
                  fontWeight={500}
                  fill="rgba(28, 31, 26, 0.8)"
                  paintOrder="stroke fill"
                  stroke="var(--canvas-alt, #F3EEE5)"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                >
                  {truncate(r.label, Math.max(4, Math.floor(r.pw / 5)))}
                </text>
              )}
            </g>
          ))}
        </g>
      )}

      {/* iter-21e — interior wall segments. Load-bearing walls
          drawn thicker + darker ; regular cloisons thinner. Drawn
          on top of rooms, underneath zones. */}
      {shapedWalls.length > 0 && (
        <g pointerEvents="none">
          {shapedWalls.map((seg) => (
            <line
              key={`wall-${seg.i}`}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.isLoadBearing ? "rgba(28, 31, 26, 0.75)" : "rgba(28, 31, 26, 0.55)"}
              strokeWidth={seg.strokeWidth * (seg.isLoadBearing ? 1.4 : 1)}
              strokeLinecap="butt"
            />
          ))}
        </g>
      )}

      {/* Zones — render biggest-first (caller's sort order) so
          smaller zones stack ON TOP and stay visible. */}
      {shaped.map(({ z, i, col, x, y, zw, zh, labelStrategy, labelText }) => {
        const isHi = highlightIndex === i;
        const clickable = !!onZoneClick;
        return (
          <g
            key={`${z.label}-${i}-${x.toFixed(1)}`}
            style={{ cursor: clickable ? "pointer" : "default" }}
            onClick={clickable ? () => onZoneClick!(z, i) : undefined}
          >
            {/* Halo — sits under the main rect for visual separation
                when zones overlap. Canvas colour, 2 px. */}
            <rect
              x={x - 0.5}
              y={y - 0.5}
              width={zw + 1}
              height={zh + 1}
              fill="none"
              stroke="var(--canvas-alt, #F3EEE5)"
              strokeWidth={2}
              rx={3}
            />
            <rect
              x={x}
              y={y}
              width={zw}
              height={zh}
              fill={col.fill}
              stroke={col.stroke}
              strokeWidth={isHi ? 2 : 1.5}
              opacity={
                isHi ? 1 : highlightIndex === null ? 1 : 0.6
              }
              rx={2}
            />
            {numbered ? (
              <g pointerEvents="none">
                <circle
                  className="do-fp-num-bg"
                  cx={x + zw / 2}
                  cy={y + zh / 2}
                  r={12}
                  stroke={col.stroke}
                />
                <text
                  className="do-fp-num"
                  x={x + zw / 2}
                  y={y + zh / 2 + 4}
                  textAnchor="middle"
                >
                  {i + 1}
                </text>
              </g>
            ) : labelStrategy === "centre" ? (
              <text
                className="do-fp-label"
                x={x + zw / 2}
                y={y + zh / 2 + 4}
                textAnchor="middle"
                fill={col.label}
                pointerEvents="none"
              >
                {labelText}
              </text>
            ) : labelStrategy === "corner" ? (
              <text
                className="do-fp-label"
                x={x + 6}
                y={y + 14}
                textAnchor="start"
                fill={col.label}
                pointerEvents="none"
              >
                {labelText}
              </text>
            ) : null}
          </g>
        );
      })}

      {children}
    </svg>
  );
}

function truncate(text: string, maxChars: number): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  if (maxChars < 3) return "";
  return text.slice(0, Math.max(1, maxChars - 1)).trimEnd() + "…";
}
