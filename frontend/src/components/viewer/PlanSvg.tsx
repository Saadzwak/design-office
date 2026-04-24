import type { FloorPlan } from "../../lib/api";

type Props = {
  plan: FloorPlan;
  highlightedVariant?: "villageois" | "atelier" | "hybride_flex" | null;
  zones?: Array<{
    kind: string;
    bbox_mm?: [number, number, number, number];
    origin_mm?: [number, number];
    position_mm?: [number, number];
    corner1_mm?: [number, number];
    corner2_mm?: [number, number];
  }>;
  /** iter-21b : show existing rooms + interior walls underneath the
   *  variant overlay. Default true — hide via `showExistingRooms={false}`
   *  if you want the old shell-only rendering (e.g. for a print export
   *  where the client shouldn't see the as-built partitions). */
  showExistingRooms?: boolean;
};

const PAD = 2000; // mm padding around plate

// Organic Modern palette — each variant gets a single pigment,
// used sparingly as a hairline and a 10–20% wash. The architecture
// itself (envelope, columns, cores) is drawn in the ink / sand palette
// to read as a real architectural plan, not a UI mood-board.
const PALETTE: Record<string, string> = {
  villageois: "#2F4A3F", // forest
  atelier: "#A08863", // sand-deep
  hybride_flex: "#C8A82F", // sun, shifted down for paper contrast
};

// Neutral paper hues, used for the plan itself.
const INK = "#1C1F1A";
const INK_SOFT = "#2F3330";
const SAND = "#C9B79C";
const SAND_SOFT = "#E5DCCB";

export default function PlanSvg({
  plan,
  highlightedVariant = null,
  zones = [],
  showExistingRooms = true,
}: Props) {
  const env = plan.envelope.points;
  const xs = env.map((p) => p.x);
  const ys = env.map((p) => p.y);
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD;
  const maxY = Math.max(...ys) + PAD;
  const w = maxX - minX;
  const h = maxY - minY;

  const accent = highlightedVariant ? PALETTE[highlightedVariant] : PALETTE.villageois;

  // iter-21c — Derive stroke widths and font sizes from the viewport
  // dimensions so lines stay legible whether the envelope is 25 m
  // (Lovable residential) or 250 m (a big tertiary plate). Without
  // this every SVG stroke was using absolute millimetre values
  // calibrated for the Lumen fixture ; on a bigger envelope the
  // strokes became sub-pixel thin and invisible.
  const envDiag = Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  // Reference diagonal ≈ 72 000 mm (Lumen 60×40 m plate). Everything
  // else is scaled proportionally so visual weight stays constant.
  const scale = Math.max(envDiag / 72000, 0.1);
  const stroke = {
    envelope: 120 * scale,
    column: 50 * scale,
    core: 60 * scale,
    window: 200 * scale,
    zone: 70 * scale,
    room: 30 * scale,
    roomStrokeDash: `${80 * scale} ${40 * scale}`,
    wall: 80 * scale,
    stair: 60 * scale,
  };
  const labelFontSize = 480 * scale;

  return (
    <svg
      viewBox={`${minX} ${-maxY} ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="scale(1,-1)">
        {/* envelope — thin architectural line in ink */}
        <polygon
          points={env.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={INK}
          strokeWidth={stroke.envelope}
        />

        {/* columns — warm sand, lighter than the envelope */}
        {plan.columns.map((c, i) => (
          <circle
            key={`col-${i}`}
            cx={c.center.x}
            cy={c.center.y}
            r={Math.max(c.radius_mm, 150 * scale)}
            fill={SAND}
            stroke={INK_SOFT}
            strokeWidth={stroke.column}
          />
        ))}

        {/* cores — solid ink, the technical heart of the plate */}
        {plan.cores.map((core, i) => (
          <polygon
            key={`core-${i}`}
            points={core.outline.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={INK}
            stroke={INK}
            strokeWidth={stroke.core}
          />
        ))}

        {/* stairs */}
        {plan.stairs.map((stair, i) => {
          const pts = stair.outline.points;
          const p0 = pts[0];
          const p2 = pts[2];
          return (
            <g key={`stair-${i}`}>
              <polygon
                points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={INK_SOFT}
                stroke={INK}
                strokeWidth={stroke.stair}
              />
              <line
                x1={p0.x}
                y1={p0.y}
                x2={p2.x}
                y2={p2.y}
                stroke={SAND_SOFT}
                strokeWidth={stroke.stair}
              />
            </g>
          );
        })}

        {/* windows — per-variant accent stroke, the facade breath */}
        {plan.windows.map((w, i) => (
          <line
            key={`win-${i}`}
            x1={w.start.x}
            y1={w.start.y}
            x2={w.end.x}
            y2={w.end.y}
            stroke={accent}
            strokeWidth={stroke.window}
            strokeLinecap="round"
          />
        ))}

        {/* iter-21b — existing interior rooms, drawn IN FILIGREE below
            the variant zones. Subtle fill + hairline stroke, so when
            the variant generator snaps zones to room bboxes the client
            sees BOTH layers align. If Vision saw no interior
            partitions these arrays are empty and this renders nothing. */}
        {showExistingRooms &&
          (plan.rooms ?? []).map((r, i) => {
            const pts = r.polygon.points.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <polygon
                key={`room-${i}`}
                points={pts}
                fill={SAND_SOFT}
                fillOpacity={0.3}
                stroke={INK_SOFT}
                strokeWidth={stroke.room}
                strokeDasharray={stroke.roomStrokeDash}
              />
            );
          })}

        {/* iter-21b — existing interior walls. Thin ink strokes, no
            dashes (they are real walls, not zoning guides). Drawn
            above rooms, below variant zones. */}
        {showExistingRooms &&
          (plan.interior_walls ?? []).map((wall, i) => (
            <line
              key={`iwall-${i}`}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke={INK}
              strokeWidth={Math.max(wall.thickness_mm, stroke.wall)}
              strokeLinecap="butt"
              opacity={0.55}
            />
          ))}

        {/* iter-21b — openings (doors / passages) in interior walls,
            drawn as small sand-coloured gaps to break the wall line.
            Useful to spot at a glance how the existing plan connects. */}
        {showExistingRooms &&
          (plan.openings ?? []).map((op, i) => (
            <circle
              key={`open-${i}`}
              cx={op.center.x}
              cy={op.center.y}
              r={Math.max(op.width_mm / 2, 300 * scale)}
              fill={SAND_SOFT}
              stroke={SAND}
              strokeWidth={40 * scale}
            />
          ))}

        {/* variant zones overlay — paper-wash, never opaque */}
        {zones.map((z, i) => {
          if (z.bbox_mm) {
            const [x0, y0, x1, y1] = z.bbox_mm;
            return (
              <rect
                key={`zone-${i}`}
                x={x0}
                y={y0}
                width={x1 - x0}
                height={y1 - y0}
                fill={accent}
                fillOpacity={0.1}
                stroke={accent}
                strokeWidth={stroke.zone}
              />
            );
          }
          if (z.corner1_mm && z.corner2_mm) {
            const [x0, y0] = z.corner1_mm;
            const [x1, y1] = z.corner2_mm;
            return (
              <rect
                key={`zone-${i}`}
                x={Math.min(x0, x1)}
                y={Math.min(y0, y1)}
                width={Math.abs(x1 - x0)}
                height={Math.abs(y1 - y0)}
                fill={accent}
                fillOpacity={0.14}
                stroke={accent}
                strokeWidth={stroke.zone}
              />
            );
          }
          if (z.position_mm) {
            const [px, py] = z.position_mm;
            return (
              <circle
                key={`zone-${i}`}
                cx={px}
                cy={py}
                r={650 * scale}
                fill={accent}
                fillOpacity={0.35}
                stroke={accent}
                strokeWidth={40 * scale}
              />
            );
          }
          if (z.origin_mm) {
            const [px, py] = z.origin_mm;
            return (
              <rect
                key={`zone-${i}`}
                x={px}
                y={py}
                width={3200 * scale}
                height={1600 * scale}
                fill={accent}
                fillOpacity={0.22}
                stroke={accent}
                strokeWidth={40 * scale}
              />
            );
          }
          return null;
        })}

        {/* iter-21b — room labels. The outer <g> flips Y with
            scale(1,-1) ; we counter-flip each label's transform so
            the text reads right-side-up. Position = polygon centroid
            (average of points, good enough for labels). */}
        {showExistingRooms &&
          (plan.rooms ?? []).map((r, i) => {
            if (!r.label) return null;
            const pts = r.polygon.points;
            if (pts.length === 0) return null;
            const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            // Clamp label length so tight rooms don't overflow.
            const txt = r.label.length > 20 ? r.label.slice(0, 19) + "…" : r.label;
            return (
              <g
                key={`rlabel-${i}`}
                transform={`translate(${cx},${cy}) scale(1,-1)`}
              >
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="Inter, sans-serif"
                  fontSize={labelFontSize}
                  fontWeight={500}
                  fill={INK}
                  opacity={0.75}
                >
                  {txt}
                </text>
              </g>
            );
          })}
      </g>
    </svg>
  );
}
