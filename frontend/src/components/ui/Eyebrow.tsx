import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** When true (default), renders in mist-500 neutral. Pass `tone="forest"`
   * for the forest-accent variant used on the Brief synthesis panel. */
  tone?: "muted" | "forest";
};

/**
 * Eyebrow — short uppercase-tracked label above editorial titles.
 *
 * Ports the bundle's `.eyebrow` class into a semantic component so
 * every page agrees on spacing + tracking. `tone="forest"` maps to
 * our existing `.eyebrow-forest` helper for the accented variant.
 */
export default function Eyebrow({
  children,
  className = "",
  style,
  tone = "muted",
}: Props) {
  const base = tone === "forest" ? "eyebrow-forest" : "eyebrow";
  return (
    <div className={[base, className].join(" ")} style={style}>
      {children}
    </div>
  );
}
