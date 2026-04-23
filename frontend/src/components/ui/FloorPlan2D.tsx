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
}: Props) {
  const { w, h } = size;
  const INSET = 8;
  const INNER_W = w - INSET * 2;
  const INNER_H = h - INSET * 2;

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
