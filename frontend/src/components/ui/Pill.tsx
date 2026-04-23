import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  variant?: "default" | "active" | "ghost";
  className?: string;
  style?: CSSProperties;
  leading?: ReactNode;
  /** Render as a button with onClick. */
  onClick?: () => void;
  title?: string;
};

/**
 * Static pill — three variants matching the bundle's `.pill`,
 * `.pill-active`, `.pill-ghost`. For segmented toggles see `PillToggle`.
 */
export default function Pill({
  children,
  variant = "default",
  className = "",
  style,
  leading,
  onClick,
  title,
}: Props) {
  const classes = [
    "pill",
    variant === "active" ? "pill-active" : "",
    variant === "ghost" ? "pill-ghost" : "",
    onClick ? "cursor-pointer" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={classes}
      style={style}
      onClick={onClick}
      title={title}
    >
      {leading}
      {children}
    </Tag>
  );
}
