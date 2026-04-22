type Props = {
  tone: "idle" | "running" | "ok" | "warn" | "error";
  className?: string;
};

/**
 * Tiny status dot. Used pervasively for agent status, reviewer verdicts,
 * integration health. A single primitive keeps the visual vocabulary tight.
 */
export default function DotStatus({ tone, className = "" }: Props) {
  const map: Record<Props["tone"], string> = {
    idle: "bg-mist-300",
    running: "bg-forest animate-dot-pulse",
    ok: "bg-forest",
    warn: "bg-sun",
    error: "bg-clay",
  };
  return <span className={["inline-block h-1.5 w-1.5 rounded-full", map[tone], className].join(" ")} />;
}
