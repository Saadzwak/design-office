import type { CSSProperties, ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * A mono label above a large Fraunces numeric value. Used across the
 * TestFit variant cards, Project detail band, and anywhere else we show
 * a compact metric. Bundle parity : `components.jsx#MetricBadge`.
 */
export default function MetricBadge({
  label,
  value,
  className = "",
  style,
}: Props) {
  return (
    <div
      className={["flex flex-col gap-0.5", className].join(" ")}
      style={style}
    >
      <span className="font-mono text-[10px] uppercase tracking-label text-mist-500">
        {label.toUpperCase()}
      </span>
      <span
        className="font-display text-[1.375rem] leading-none text-ink"
        style={{ fontVariationSettings: '"opsz" 72, "wght" 440, "SOFT" 100' }}
      >
        {value}
      </span>
    </div>
  );
}
