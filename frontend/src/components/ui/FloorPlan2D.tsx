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

export const ZONE_COLORS: Record<
  ZoneKind,
  { fill: string; stroke: string }
> = {
  work: { fill: "rgba(47, 74, 63, 0.16)", stroke: "#2F4A3F" },
  collab: { fill: "rgba(201, 183, 156, 0.32)", stroke: "#A89775" },
  support: { fill: "rgba(160, 82, 45, 0.18)", stroke: "#A0522D" },
  hospitality: { fill: "rgba(232, 197, 71, 0.25)", stroke: "#C9A825" },
  biophilic: { fill: "rgba(107, 143, 127, 0.28)", stroke: "#6B8F7F" },
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
 * Bundle parity : `components.jsx#FloorPlan`, extended with
 * highlight + aria-label + children slot.
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
      <g opacity={0.12} stroke="var(--ink)" strokeWidth={0.5}>
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

      {/* Zones */}
      {zones.map((z, i) => {
        const col = ZONE_COLORS[(z.kind as ZoneKind) in ZONE_COLORS
          ? (z.kind as ZoneKind)
          : "work"];
        const x = INSET + INNER_W * (z.x / NORM_W);
        const y = INSET + INNER_H * (z.y / NORM_H);
        const zw = INNER_W * (z.w / NORM_W);
        const zh = INNER_H * (z.h / NORM_H);
        const isHi = highlightIndex === i;
        const clickable = !!onZoneClick;

        return (
          <g
            key={`${z.label}-${i}`}
            style={{ cursor: clickable ? "pointer" : "default" }}
            onClick={
              clickable
                ? () => onZoneClick!(z, i)
                : undefined
            }
          >
            <rect
              x={x}
              y={y}
              width={zw}
              height={zh}
              fill={col.fill}
              stroke={col.stroke}
              strokeWidth={isHi ? 2 : 1}
              opacity={isHi ? 1 : highlightIndex === null ? 1 : 0.6}
              rx={2}
            />
            {numbered ? (
              <g pointerEvents="none">
                <circle
                  cx={x + zw / 2}
                  cy={y + zh / 2}
                  r={12}
                  fill="var(--canvas)"
                  stroke={col.stroke}
                  strokeWidth={1}
                />
                <text
                  x={x + zw / 2}
                  y={y + zh / 2 + 4}
                  textAnchor="middle"
                  fontFamily="var(--f-mono)"
                  fontSize={11}
                  fill="var(--ink)"
                  fontWeight={500}
                >
                  {i + 1}
                </text>
              </g>
            ) : (
              <text
                x={x + 6}
                y={y + 14}
                fontFamily="var(--f-mono)"
                fontSize={8}
                fill={col.stroke}
                style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                pointerEvents="none"
              >
                {z.label}
              </text>
            )}
          </g>
        );
      })}

      {children}
    </svg>
  );
}
