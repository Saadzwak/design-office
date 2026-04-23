import type { CSSProperties } from "react";

type Props = {
  /** All-caps mono tag rendered at the centre of the tile. */
  tag: string;
  /** Aspect ratio string, e.g. `"4/5"`, `"1/1"`. Defaults to `"4/3"`. */
  ratio?: string;
  /** Optional hex colour applied as a subtle tint over the diagonal hatch. */
  tint?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Diagonal-hatch placeholder tile with an editorial mono label.
 * Used anywhere we haven't wired a real render yet, and as the loading
 * state for generated images (NanoBanana, SketchUp screenshots).
 *
 * Bundle parity : `components.jsx#Placeholder`.
 */
export default function Placeholder({
  tag,
  ratio = "4/3",
  tint,
  className = "",
  style,
}: Props) {
  const merged: CSSProperties = {
    aspectRatio: ratio,
    ...(tint
      ? {
          background: `linear-gradient(135deg, ${tint}22 0%, ${tint}44 100%), repeating-linear-gradient(135deg, rgba(28,31,26,0.04) 0 10px, transparent 10px 20px)`,
        }
      : {}),
    ...style,
  };

  return (
    <div className={["placeholder-img", className].join(" ")} style={merged}>
      <span className="block max-w-[80%] px-3">{tag}</span>
    </div>
  );
}
