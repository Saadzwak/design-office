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

export default function PlanSvg({ plan, highlightedVariant = null, zones = [] }: Props) {
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
          strokeWidth={120}
        />

        {/* columns — warm sand, lighter than the envelope */}
        {plan.columns.map((c, i) => (
          <circle
            key={`col-${i}`}
            cx={c.center.x}
            cy={c.center.y}
            r={Math.max(c.radius_mm, 150)}
            fill={SAND}
            stroke={INK_SOFT}
            strokeWidth={50}
          />
        ))}

        {/* cores — solid ink, the technical heart of the plate */}
        {plan.cores.map((core, i) => (
          <polygon
            key={`core-${i}`}
            points={core.outline.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill={INK}
            stroke={INK}
            strokeWidth={60}
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
                strokeWidth={60}
              />
              <line
                x1={p0.x}
                y1={p0.y}
                x2={p2.x}
                y2={p2.y}
                stroke={SAND_SOFT}
                strokeWidth={60}
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
            strokeWidth={200}
            strokeLinecap="round"
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
                strokeWidth={70}
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
                strokeWidth={70}
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
                r={650}
                fill={accent}
                fillOpacity={0.35}
                stroke={accent}
                strokeWidth={40}
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
                width={3200}
                height={1600}
                fill={accent}
                fillOpacity={0.22}
                stroke={accent}
                strokeWidth={40}
              />
            );
          }
          return null;
        })}
      </g>
    </svg>
  );
}
