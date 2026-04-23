import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  as?: "div" | "button" | "article" | "li";
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  /** Visual variant :
   *  - default : raised ivory with hover elevation
   *  - flat : same surface, no hover
   *  - soft : canvas background (for within-a-card sub-cards) */
  variant?: "default" | "flat" | "soft";
  /** Strip the default 24 px padding — useful when the card wraps a media
   *  block that needs to bleed edge-to-edge. */
  noPadding?: boolean;
  ariaLabel?: string;
};

/**
 * Card — the bundle's `.card` primitive. Every surface uses it (dashboard
 * projects, TestFit variants, Brief programme tiles, Mood Board drill
 * topics, Justify sections, Export result). Single source of truth keeps
 * hover + radius + border consistent across the app.
 */
export default function Card({
  children,
  as = "div",
  className = "",
  style,
  onClick,
  variant = "default",
  noPadding = false,
  ariaLabel,
}: Props) {
  const variantClass =
    variant === "flat" ? "card-flat" : variant === "soft" ? "card-soft" : "card";
  const classes = [
    variantClass,
    noPadding ? "!p-0" : "",
    onClick ? "cursor-pointer text-left" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (as === "button") {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }
  const Tag = as;
  return (
    <Tag
      className={classes}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  );
}
