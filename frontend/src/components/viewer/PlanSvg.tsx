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
const PALETTE: Record<string, string> = {
  villageois: "#C9694E",
  atelier: "#A68A5B",
  hybride_flex: "#7A9E7E",
};

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

  const accent = highlightedVariant ? PALETTE[highlightedVariant] : "#C9694E";

  return (
    <svg
      viewBox={`${minX} ${-maxY} ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="scale(1,-1)">
        {/* envelope */}
        <polygon
          points={env.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#ECEBE4"
          strokeWidth={120}
        />

        {/* columns */}
        {plan.columns.map((c, i) => (
          <circle
            key={`col-${i}`}
            cx={c.center.x}
            cy={c.center.y}
            r={Math.max(c.radius_mm, 150)}
            fill="#4F4D48"
            stroke="#ECEBE4"
            strokeWidth={60}
          />
        ))}

        {/* cores */}
        {plan.cores.map((core, i) => (
          <polygon
            key={`core-${i}`}
            points={core.outline.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="#22211E"
            stroke="#ECEBE4"
            strokeWidth={80}
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
                fill="#34332F"
                stroke="#ECEBE4"
                strokeWidth={80}
              />
              <line
                x1={p0.x}
                y1={p0.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#ECEBE4"
                strokeWidth={80}
              />
            </g>
          );
        })}

        {/* windows */}
        {plan.windows.map((w, i) => (
          <line
            key={`win-${i}`}
            x1={w.start.x}
            y1={w.start.y}
            x2={w.end.x}
            y2={w.end.y}
            stroke={accent}
            strokeWidth={220}
            strokeLinecap="round"
          />
        ))}

        {/* variant zones overlay */}
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
                fillOpacity={0.12}
                stroke={accent}
                strokeWidth={90}
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
                fillOpacity={0.18}
                stroke={accent}
                strokeWidth={90}
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
                r={700}
                fill={accent}
                fillOpacity={0.4}
                stroke={accent}
                strokeWidth={60}
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
                fillOpacity={0.25}
                stroke={accent}
                strokeWidth={60}
              />
            );
          }
          return null;
        })}
      </g>
    </svg>
  );
}
