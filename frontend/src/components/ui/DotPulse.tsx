type Props = {
  /** CSS colour value (token or hex). Defaults to `var(--forest)`. */
  color?: string;
  className?: string;
};

/**
 * Three dots staggered at 150 ms intervals. Bundle parity : mirrors
 * `components.jsx#DotPulse`. Used next to the "AgentTrace" running
 * row to hint a live sub-agent without taking space for a spinner.
 */
export default function DotPulse({ color = "var(--forest)", className = "" }: Props) {
  return (
    <span
      className={["inline-flex items-center gap-[3px]", className].join(" ")}
      aria-label="loading"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full"
          style={{
            background: color,
            animation: `dot-pulse 1.1s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
